import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
    collection,
    query,
    getDocs,
    getDoc,
    getDocFromCache,
    doc,
    addDoc,
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
 * Active notes of a notebook, kept live by a snapshot listener.
 * Pass `enabled = false` (e.g. for collapsed notebooks) to avoid opening a
 * listener and downloading every note in every notebook on startup.
 */
export function useNotes(notebookId: string | null, enabled = true) {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;
    const active = enabled && !!notebookId && !!userId;

    const parseList = (docs: DocumentSnapshot<DocumentData>[]) =>
        sortByTitle(
            docs
                .map((d) => parseNote(d, notebookId!, { includeContent: false }))
                .filter((n) => n.deleted_at === null)
        );

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

// Mutations
export function useCreateNote() {
    return useMutation({
        mutationFn: async (note: NewNote): Promise<Note> => {
            const safeTitle = sanitizeTitle(note.title || 'Untitled');
            const safeContent = validateContent(note.content);
            const docRef = await addDoc(getNotesRef(note.notebook_id), {
                title: safeTitle,
                content: safeContent,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                deletedAt: null,
            });

            const now = new Date().toISOString();
            return {
                id: docRef.id,
                notebook_id: note.notebook_id,
                title: safeTitle,
                content: safeContent,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            };
        },
    });
}

export function useSoftDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            await updateDoc(doc(getNotesRef(notebookId), id), {
                deletedAt: serverTimestamp(),
            });
            return { id, notebookId };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

export function useRestoreNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            await updateDoc(doc(getNotesRef(notebookId), id), {
                deletedAt: null,
            });
            return { id, notebookId };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

export function usePermanentlyDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            await deleteDoc(doc(getNotesRef(notebookId), id));
            return { id, notebookId };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

/**
 * Move note to a different notebook.
 *
 * The note keeps its ID, so an open editor stays attached to it. Callers must
 * flush pending editor saves first (see `flushPendingSaves`) so the copy
 * contains the latest content.
 */
export function useMoveNote() {
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

            const oldDocRef = doc(getNotesRef(fromNotebookId), id);
            // Prefer the local cache: it already contains any pending local
            // edits and does not need the network.
            let snap = await getDocFromCache(oldDocRef).catch(() => null);
            if (!snap?.exists()) snap = await getDoc(oldDocRef);
            if (!snap.exists()) throw new Error('Note not found');

            const ui = useUIStore.getState();
            if (ui.selectedNoteId === id) {
                // Re-point the open editor before the old document disappears.
                ui.selectNote(id, toNotebookId, ui.isTrashView);
            }

            const batch = writeBatch(db);
            batch.set(doc(getNotesRef(toNotebookId), id), {
                ...snap.data(),
                updatedAt: serverTimestamp(),
            });
            batch.delete(oldDocRef);
            await batch.commit();
        },
    });
}
