import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
    collection,
    query,
    getDocs,
    getDoc,
    getDocFromCache,
    getDocsFromCache,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    onSnapshot,
    where,
    type DocumentData,
    type DocumentSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { firstSnapshot, toIso } from '../lib/firestoreUtils';
import { sanitizeTitle } from './useNotebooks';
import { useUIStore } from '../stores/uiStore';
import { inBackground } from '../lib/notify';
import type { Note, NewNote } from '../lib/types';

// Firestore documents are limited to 1 MiB; keep a safe margin (mirrored in UI messages).
export const MAX_CONTENT_SIZE_BYTES = 800_000;

const encoder = new TextEncoder();

/**
 * Validate note content and strip `undefined` values (Firestore rejects them).
 * Throws a user-readable error when the content is invalid or too large.
 */
const validateContent = (content: unknown): unknown[] => {
    if (content === undefined || content === null) return [];
    if (!Array.isArray(content)) {
        throw new Error('Invalid note content format');
    }

    const serialized = JSON.stringify(content);
    const bytes = encoder.encode(serialized).length;
    if (bytes > MAX_CONTENT_SIZE_BYTES) {
        throw new Error(
            `This note is too large to save (${Math.round(bytes / 1000)} KB, limit ${MAX_CONTENT_SIZE_BYTES / 1000} KB). Try splitting it into several notes.`
        );
    }
    return JSON.parse(serialized);
};

const requireUid = () => {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Not authenticated');
    return userId;
};

const getNotesRef = (notebookId: string) =>
    collection(db, 'users', requireUid(), 'notebooks', notebookId, 'notes');

const parseNote = (
    docSnap: DocumentSnapshot<DocumentData>,
    notebookId: string,
    { includeContent }: { includeContent: boolean }
): Note => {
    const data = docSnap.data({ serverTimestamps: 'estimate' }) ?? {};
    return {
        id: docSnap.id,
        notebook_id: notebookId,
        title: data.title ?? '',
        // Lists (sidebar, trash) never render content; dropping it keeps the
        // in-memory cache small for notebooks with large notes.
        content: includeContent ? data.content : undefined,
        created_at: toIso(data.createdAt)!,
        updated_at: toIso(data.updatedAt)!,
        deleted_at: toIso(data.deletedAt, null),
        has_pending_writes: docSnap.metadata.hasPendingWrites,
    };
};

const sortByTitle = (notes: Note[]) =>
    notes.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));

/**
 * Note moves whose copy/delete hasn't landed in Firestore's local cache yet.
 * Applied to every list snapshot so a snapshot arriving in that gap (e.g. from
 * an editor save flushed right before the move) can't show the note in its old
 * notebook again.
 */
const pendingMoves = new Map<string, { from: string; to: string; note: Note }>();

const applyPendingMoves = (docIds: Set<string>, list: Note[], notebookId: string) => {
    if (pendingMoves.size === 0) return list;
    // Once the target notebook's snapshot contains the note, the move is in the
    // local cache and the overlay must go — otherwise it would keep re-adding a
    // stale copy (e.g. after the note is trashed or renamed).
    pendingMoves.forEach(({ to }, id) => {
        if (to === notebookId && docIds.has(id)) pendingMoves.delete(id);
    });
    const result = list.filter((n) => pendingMoves.get(n.id)?.from !== notebookId);
    pendingMoves.forEach(({ to, note }, id) => {
        if (to === notebookId && !result.some((n) => n.id === id)) result.push(note);
    });
    return result;
};

const parseNoteList = (docs: DocumentSnapshot<DocumentData>[], notebookId: string) =>
    sortByTitle(
        applyPendingMoves(
            new Set(docs.map((d) => d.id)),
            docs
                .map((d) => parseNote(d, notebookId, { includeContent: false }))
                .filter((n) => n.deleted_at === null),
            notebookId
        )
    );

/**
 * Warm the note lists of all notebooks in the background, so expanding a
 * notebook for the first time shows its notes instantly — without keeping a
 * live listener open per notebook.
 *
 * Reads the device's Firestore cache first (instant, no network). Only
 * notebooks with nothing cached are fetched once from the server.
 */
export function usePrefetchNoteLists(notebookIds: string[] | undefined) {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;
    const idsKey = notebookIds?.join(',') ?? '';

    useEffect(() => {
        if (!userId || !idsKey) return;
        let cancelled = false;
        const missing = idsKey
            .split(',')
            .filter((id) => queryClient.getQueryData(['notes', id]) === undefined);

        (async () => {
            const needServer: string[] = [];
            await Promise.all(
                missing.map(async (id) => {
                    try {
                        const snap = await getDocsFromCache(query(getNotesRef(id)));
                        if (cancelled) return;
                        if (snap.empty) {
                            needServer.push(id);
                        } else if (queryClient.getQueryData(['notes', id]) === undefined) {
                            queryClient.setQueryData(['notes', id], parseNoteList(snap.docs, id));
                        }
                    } catch {
                        needServer.push(id);
                    }
                })
            );
            await Promise.all(
                needServer.map(async (id) => {
                    try {
                        const snap = await getDocs(query(getNotesRef(id)));
                        if (!cancelled && queryClient.getQueryData(['notes', id]) === undefined) {
                            queryClient.setQueryData(['notes', id], parseNoteList(snap.docs, id));
                        }
                    } catch (err) {
                        console.warn('Prefetching notes failed for notebook', id, err);
                    }
                })
            );
        })();

        return () => {
            cancelled = true;
        };
    }, [idsKey, userId, queryClient]);
}

/** True only if `active` stays true for `delayMs` (avoids spinner flicker). */
export function useDelayedFlag(active: boolean, delayMs = 250) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        if (!active) {
            setShown(false);
            return;
        }
        const t = setTimeout(() => setShown(true), delayMs);
        return () => clearTimeout(t);
    }, [active, delayMs]);
    return shown;
}

/**
 * Active notes of a notebook, kept live by a snapshot listener.
 * Pass `enabled = false` (e.g. for collapsed notebooks) to avoid opening a
 * listener and downloading every note in every notebook on startup.
 */
export function useNotes(notebookId: string | null, enabled = true) {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;
    const active = enabled && !!notebookId && !!userId;

    const parseList = (docs: DocumentSnapshot<DocumentData>[]) => parseNoteList(docs, notebookId!);

    const result = useQuery({
        queryKey: ['notes', notebookId],
        queryFn: () =>
            firstSnapshot<Note[]>((next, error) =>
                onSnapshot(query(getNotesRef(notebookId!)), (s) => next(parseList(s.docs)), error)
            ),
        enabled: active,
        staleTime: Infinity,
    });

    useEffect(() => {
        if (!active) return;
        return onSnapshot(
            query(getNotesRef(notebookId!)),
            (snapshot) => queryClient.setQueryData(['notes', notebookId], parseList(snapshot.docs)),
            (error) => console.error('Error in notes snapshot listener:', error)
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, notebookId, queryClient]);

    return result;
}

// Fetch trashed notes across all notebooks (queries run in parallel)
export function useTrashedNotes() {
    const userId = auth.currentUser?.uid;
    return useQuery({
        queryKey: ['notes', 'trashed'],
        queryFn: async (): Promise<Note[]> => {
            const uid = requireUid();
            const notebooksSnapshot = await getDocs(collection(db, 'users', uid, 'notebooks'));

            const perNotebook = await Promise.all(
                notebooksSnapshot.docs.map(async (nbDoc) => {
                    const snap = await getDocs(query(getNotesRef(nbDoc.id), where('deletedAt', '!=', null)));
                    return snap.docs.map((d) => parseNote(d, nbDoc.id, { includeContent: false }));
                })
            );

            return perNotebook
                .flat()
                .filter((n) => n.deleted_at !== null)
                .sort((a, b) => new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime());
        },
        enabled: !!userId,
    });
}

// Fetch a single note (with content), kept live by a snapshot listener
export function useNote(noteId: string | null, notebookId?: string | null) {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;
    const active = !!noteId && !!notebookId && !!userId;

    const result = useQuery({
        // Keyed by note ID only so that moving a note between notebooks
        // (same ID, new path) does not flash a loading state.
        queryKey: ['note', noteId],
        queryFn: () =>
            firstSnapshot<Note | null>((next, error) =>
                onSnapshot(
                    doc(getNotesRef(notebookId!), noteId!),
                    (s) => next(s.exists() ? parseNote(s, notebookId!, { includeContent: true }) : null),
                    error
                )
            ),
        enabled: active,
        staleTime: Infinity,
    });

    useEffect(() => {
        if (!active) return;
        return onSnapshot(
            doc(getNotesRef(notebookId!), noteId!),
            (docSnap) => {
                if (docSnap.exists()) {
                    queryClient.setQueryData(['note', noteId], parseNote(docSnap, notebookId!, { includeContent: true }));
                    return;
                }
                // The doc vanished. Ignore it if the note was just moved to
                // another notebook (selection already points to the new path).
                if (useUIStore.getState().selectedNotebookId === notebookId) {
                    queryClient.setQueryData(['note', noteId], null);
                }
            },
            (error) => console.error('Error in note snapshot listener:', error)
        );
    }, [active, noteId, notebookId, queryClient]);

    return result;
}

/**
 * Write note fields directly to Firestore.
 *
 * The returned promise resolves when the server acknowledges the write, but the
 * change is applied to the local (persistent) cache immediately, so callers
 * should NOT block the UI on it — offline it only resolves after reconnecting.
 */
export function saveNoteFields(
    notebookId: string,
    noteId: string,
    fields: { title?: string; content?: unknown }
): Promise<void> {
    try {
        const updates: DocumentData = { updatedAt: serverTimestamp() };
        if (fields.title !== undefined) updates.title = sanitizeTitle(fields.title);
        if (fields.content !== undefined) updates.content = validateContent(fields.content);
        return updateDoc(doc(getNotesRef(notebookId), noteId), updates);
    } catch (err) {
        return Promise.reject(err);
    }
}

// --- Optimistic cache helpers -------------------------------------------------
// See useNotebooks.ts: patch the cache now, write in the background, resync from
// Firestore's local cache if the write fails.

type QC = ReturnType<typeof useQueryClient>;
const TRASHED_KEY = ['notes', 'trashed'];

function patchList(queryClient: QC, key: unknown[], fn: (list: Note[]) => Note[]) {
    const prev = queryClient.getQueryData<Note[]>(key);
    if (prev) queryClient.setQueryData(key, fn(prev));
}

const findCachedNote = (queryClient: QC, notebookId: string, id: string): Note | undefined =>
    queryClient.getQueryData<Note[]>(['notes', notebookId])?.find((n) => n.id === id) ??
    queryClient.getQueryData<Note[]>(TRASHED_KEY)?.find((n) => n.id === id);

async function resyncNoteList(queryClient: QC, notebookId: string) {
    if (!queryClient.getQueryData(['notes', notebookId])) return;
    const q = query(getNotesRef(notebookId));
    const snap = await getDocsFromCache(q).catch(() => getDocs(q));
    queryClient.setQueryData(['notes', notebookId], parseNoteList(snap.docs, notebookId));
}

// Mutations
export function useCreateNote() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (note: NewNote): Promise<Note> => {
            const safeTitle = sanitizeTitle(note.title || 'Untitled');
            const safeContent = validateContent(note.content);
            const ref = doc(getNotesRef(note.notebook_id)); // ID generated on the client
            const now = new Date().toISOString();
            const created: Note = {
                id: ref.id,
                notebook_id: note.notebook_id,
                title: safeTitle,
                content: safeContent,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            };
            patchList(queryClient, ['notes', note.notebook_id], (list) =>
                sortByTitle([...list, { ...created, content: undefined }])
            );
            inBackground(
                setDoc(ref, {
                    title: safeTitle,
                    content: safeContent,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    deletedAt: null,
                }),
                'Creating note',
                () => resyncNoteList(queryClient, note.notebook_id)
            );
            return created;
        },
    });
}

/** Rename a note from outside the editor (list caches update immediately). */
export function renameNote(queryClient: QC, notebookId: string, id: string, title: string) {
    const safeTitle = sanitizeTitle(title);
    patchList(queryClient, ['notes', notebookId], (list) =>
        sortByTitle(list.map((n) => (n.id === id ? { ...n, title: safeTitle } : n)))
    );
    inBackground(saveNoteFields(notebookId, id, { title: safeTitle }), 'Renaming note', () =>
        resyncNoteList(queryClient, notebookId)
    );
}

export function useSoftDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            const cached = findCachedNote(queryClient, notebookId, id);
            patchList(queryClient, ['notes', notebookId], (list) => list.filter((n) => n.id !== id));
            if (cached) {
                patchList(queryClient, TRASHED_KEY, (list) => [
                    { ...cached, deleted_at: new Date().toISOString() },
                    ...list.filter((n) => n.id !== id),
                ]);
            }
            inBackground(
                updateDoc(doc(getNotesRef(notebookId), id), { deletedAt: serverTimestamp() }).then(() =>
                    queryClient.invalidateQueries({ queryKey: TRASHED_KEY })
                ),
                'Moving note to trash',
                () => resyncNoteList(queryClient, notebookId)
            );
            return { id, notebookId };
        },
    });
}

export function useRestoreNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            const cached = findCachedNote(queryClient, notebookId, id);
            patchList(queryClient, TRASHED_KEY, (list) => list.filter((n) => n.id !== id));
            if (cached) {
                patchList(queryClient, ['notes', notebookId], (list) =>
                    sortByTitle([...list.filter((n) => n.id !== id), { ...cached, deleted_at: null }])
                );
            }
            inBackground(
                updateDoc(doc(getNotesRef(notebookId), id), { deletedAt: null }).then(() =>
                    queryClient.invalidateQueries({ queryKey: TRASHED_KEY })
                ),
                'Restoring note',
                () => {
                    resyncNoteList(queryClient, notebookId);
                    queryClient.invalidateQueries({ queryKey: TRASHED_KEY });
                }
            );
            return { id, notebookId };
        },
    });
}

export function usePermanentlyDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            patchList(queryClient, TRASHED_KEY, (list) => list.filter((n) => n.id !== id));
            inBackground(deleteDoc(doc(getNotesRef(notebookId), id)), 'Deleting note', () =>
                queryClient.invalidateQueries({ queryKey: TRASHED_KEY })
            );
            return { id, notebookId };
        },
    });
}

/**
 * Move note to a different notebook.
 *
 * The note keeps its ID, so an open editor stays attached to it. Callers must
 * flush pending editor saves first (see `flushPendingSaves`) so the copy
 * contains the latest content. Lists update immediately; the copy + delete
 * runs in the background.
 */
export function useMoveNote() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            id,
            fromNotebookId,
            toNotebookId,
        }: {
            id: string;
            fromNotebookId: string;
            toNotebookId: string;
        }) => {
            if (fromNotebookId === toNotebookId) return;

            const cached = findCachedNote(queryClient, fromNotebookId, id);
            const entry = cached
                ? { from: fromNotebookId, to: toNotebookId, note: { ...cached, notebook_id: toNotebookId } }
                : null;
            if (entry) pendingMoves.set(id, entry);
            patchList(queryClient, ['notes', fromNotebookId], (list) => list.filter((n) => n.id !== id));
            if (cached) {
                patchList(queryClient, ['notes', toNotebookId], (list) =>
                    sortByTitle([...list.filter((n) => n.id !== id), { ...cached, notebook_id: toNotebookId }])
                );
            }

            const ui = useUIStore.getState();
            const wasSelected = ui.selectedNoteId === id;
            if (wasSelected) {
                // Re-point the open editor before the old document disappears.
                ui.selectNote(id, toNotebookId, ui.isTrashView);
            }

            const work = (async () => {
                const oldDocRef = doc(getNotesRef(fromNotebookId), id);
                // Prefer the local cache: it already contains any pending local
                // edits and does not need the network.
                let snap = await getDocFromCache(oldDocRef).catch(() => null);
                if (!snap?.exists()) snap = await getDoc(oldDocRef);
                if (!snap.exists()) throw new Error('Note not found');

                const batch = writeBatch(db);
                batch.set(doc(getNotesRef(toNotebookId), id), {
                    ...snap.data(),
                    updatedAt: serverTimestamp(),
                });
                batch.delete(oldDocRef);
                // The overlay is dropped as soon as a snapshot shows the note in
                // its new notebook (see applyPendingMoves), or when this settles.
                await batch.commit();
            })().finally(() => {
                // Only clear our own entry (a newer move of the same note may own it now)
                if (entry && pendingMoves.get(id) === entry) pendingMoves.delete(id);
            });

            inBackground(work, 'Moving note', () => {
                resyncNoteList(queryClient, fromNotebookId);
                resyncNoteList(queryClient, toNotebookId);
                const now = useUIStore.getState();
                if (wasSelected && now.selectedNoteId === id) now.selectNote(id, fromNotebookId, now.isTrashView);
            });
        },
    });
}
