import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
    collection,
    getDocs,
    getDocsFromCache,
    doc,
    setDoc,
    updateDoc,
    serverTimestamp,
    onSnapshot,
    type DocumentData,
    type QueryDocumentSnapshot,
    type QuerySnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { commitInChunks, firstSnapshot, toIso } from '../lib/firestoreUtils';
import { inBackground } from '../lib/notify';
import type { Note, Notebook, NewNotebook } from '../lib/types';

// Security: Input validation constants (mirrored in firestore.rules)
const MAX_TITLE_LENGTH = 200;

// Strip HTML tags and enforce length limits
export const sanitizeTitle = (title: string): string => {
    const stripped = title.replace(/<[^>]*>/g, '').trim();
    return stripped.slice(0, MAX_TITLE_LENGTH);
};

const requireUid = () => {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Not authenticated');
    return userId;
};

const getNotebooksRef = () => collection(db, 'users', requireUid(), 'notebooks');
const getNotesRefFor = (notebookId: string) =>
    collection(db, 'users', requireUid(), 'notebooks', notebookId, 'notes');

const parseNotebook = (docSnap: QueryDocumentSnapshot<DocumentData>, userId: string): Notebook => {
    const data = docSnap.data({ serverTimestamps: 'estimate' });
    return {
        id: docSnap.id,
        user_id: userId,
        title: data.title ?? '',
        parent_notebook_id: data.parentNotebookId || null,
        created_at: toIso(data.createdAt)!,
        updated_at: toIso(data.updatedAt)!,
        deleted_at: toIso(data.deletedAt, null),
    };
};

/**
 * Changes whose Firestore writes haven't been issued yet (e.g. a cascade that
 * first has to fetch notes). Applied on top of every snapshot so an unrelated
 * snapshot arriving in that gap can't briefly undo the optimistic change.
 * `null` = removed.
 */
const notebookOverlay = new Map<string, Partial<Notebook> | null>();

const applyOverlay = (list: Notebook[]) => {
    if (notebookOverlay.size === 0) return list;
    const ids = new Set(list.map((nb) => nb.id));
    // Drop entries the local cache already reflects, so a stale overlay can
    // never mask later changes (e.g. while offline, when commits never settle).
    notebookOverlay.forEach((patch, id) => {
        const nb = list.find((n) => n.id === id);
        if (patch === null ? !ids.has(id) : nb && (nb.deleted_at === null) === (patch.deleted_at === null)) {
            notebookOverlay.delete(id);
        }
    });
    return list.flatMap((nb) => {
        if (!notebookOverlay.has(nb.id)) return [nb];
        const patch = notebookOverlay.get(nb.id);
        return patch === null ? [] : [{ ...nb, ...patch }];
    });
};

const parseAll = (snapshot: QuerySnapshot<DocumentData>, userId: string) =>
    applyOverlay(snapshot.docs.map((d) => parseNotebook(d, userId)));

const notebooksKey = (userId: string | undefined) => ['notebooks', userId ?? 'anon'];

/**
 * All notebooks (active + trashed) for the current user, kept live by a single
 * snapshot listener. Active and trashed views are derived from this list, so
 * the trash no longer needs its own query or manual invalidation.
 */
function useAllNotebooks() {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;
    const key = notebooksKey(userId);

    const query = useQuery({
        queryKey: key,
        queryFn: () =>
            firstSnapshot<Notebook[]>((next, error) =>
                onSnapshot(getNotebooksRef(), (s) => next(parseAll(s, userId!)), error)
            ),
        enabled: !!userId,
        staleTime: Infinity,
    });

    useEffect(() => {
        if (!userId) return;
        return onSnapshot(
            getNotebooksRef(),
            (snapshot) => queryClient.setQueryData(notebooksKey(userId), parseAll(snapshot, userId)),
            (error) => console.error('Error in notebooks snapshot listener:', error)
        );
    }, [userId, queryClient]);

    return query;
}

// Active notebooks, sorted by title
export function useNotebooks() {
    const { data, ...rest } = useAllNotebooks();
    const active = useMemo(
        () =>
            data
                ?.filter((nb) => nb.deleted_at === null)
                .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
        [data]
    );
    return { data: active, ...rest };
}

// Trashed notebooks, most recently deleted first
export function useTrashedNotebooks() {
    const { data, ...rest } = useAllNotebooks();
    const trashed = useMemo(
        () =>
            data
                ?.filter((nb) => nb.deleted_at !== null)
                .sort((a, b) => new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime()),
        [data]
    );
    return { data: trashed, ...rest };
}

// Get all descendant notebook IDs (guards against cycles in corrupted data)
function getDescendantNotebookIds(notebookId: string, allNotebooks: Notebook[]): string[] {
    const byParent = new Map<string, string[]>();
    for (const nb of allNotebooks) {
        if (!nb.parent_notebook_id) continue;
        const list = byParent.get(nb.parent_notebook_id) ?? [];
        list.push(nb.id);
        byParent.set(nb.parent_notebook_id, list);
    }

    const result: string[] = [];
    const visited = new Set<string>([notebookId]);
    const stack = [...(byParent.get(notebookId) ?? [])];
    while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        result.push(id);
        stack.push(...(byParent.get(id) ?? []));
    }
    return result;
}

/** Notebook + all of its descendants, using the cached list when available. */
async function getNotebookSubtree(id: string, queryClient: ReturnType<typeof useQueryClient>) {
    const userId = requireUid();
    let all = queryClient.getQueryData<Notebook[]>(notebooksKey(userId));
    if (!all) {
        const snapshot = await getDocs(getNotebooksRef());
        all = parseAll(snapshot, userId);
    }
    return [id, ...getDescendantNotebookIds(id, all)];
}

/** Fetch the notes of several notebooks in parallel. */
async function getNotesOf(notebookIds: string[]) {
    const snapshots = await Promise.all(notebookIds.map((nbId) => getDocs(getNotesRefFor(nbId))));
    return snapshots.flatMap((s) => s.docs);
}

// --- Optimistic cache helpers -------------------------------------------------
//
// Mutations patch the React Query cache synchronously so the UI changes in the
// same frame as the user's action, then write to Firestore in the background.
// (Waiting for the server made rows snap back, vanish and reappear.) If a write
// fails, the cache is re-synced from Firestore's local cache.

type QC = ReturnType<typeof useQueryClient>;

function patchNotebooks(queryClient: QC, fn: (list: Notebook[]) => Notebook[]) {
    const key = notebooksKey(auth.currentUser?.uid);
    const prev = queryClient.getQueryData<Notebook[]>(key);
    if (prev) queryClient.setQueryData(key, fn(prev));
}

/** Replace the cached notebooks with what Firestore currently holds locally. */
async function resyncNotebooks(queryClient: QC) {
    const userId = requireUid();
    const snapshot = await getDocsFromCache(getNotebooksRef()).catch(() => getDocs(getNotebooksRef()));
    queryClient.setQueryData(notebooksKey(userId), parseAll(snapshot, userId));
}

// Create notebook (supports sub-notebooks)
export function useCreateNotebook() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (notebook: NewNotebook): Promise<Notebook> => {
            const safeTitle = sanitizeTitle(notebook.title || 'Untitled') || 'Untitled';
            const ref = doc(getNotebooksRef()); // ID generated on the client
            const now = new Date().toISOString();
            const created: Notebook = {
                id: ref.id,
                user_id: requireUid(),
                title: safeTitle,
                parent_notebook_id: notebook.parent_notebook_id || null,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            };
            patchNotebooks(queryClient, (list) => [...list, created]);
            inBackground(
                setDoc(ref, {
                    title: safeTitle,
                    parentNotebookId: created.parent_notebook_id,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    deletedAt: null,
                }),
                'Creating notebook',
                () => resyncNotebooks(queryClient)
            );
            return created;
        },
    });
}

// Update notebook title
export function useUpdateNotebook() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, title }: { id: string; title: string }) => {
            const safeTitle = sanitizeTitle(title);
            if (!safeTitle) return;
            patchNotebooks(queryClient, (list) => list.map((nb) => (nb.id === id ? { ...nb, title: safeTitle } : nb)));
            inBackground(
                updateDoc(doc(getNotebooksRef(), id), { title: safeTitle, updatedAt: serverTimestamp() }),
                'Renaming notebook',
                () => resyncNotebooks(queryClient)
            );
        },
    });
}

// Move notebook to different parent (or to root)
export function useMoveNotebook() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, newParentId }: { id: string; newParentId: string | null }) => {
            if (newParentId) {
                // Never allow a notebook to become its own ancestor
                const subtree = await getNotebookSubtree(id, queryClient);
                if (subtree.includes(newParentId)) {
                    throw new Error('Cannot move a notebook into itself or one of its sub-notebooks.');
                }
            }
            patchNotebooks(queryClient, (list) =>
                list.map((nb) => (nb.id === id ? { ...nb, parent_notebook_id: newParentId } : nb))
            );
            inBackground(
                updateDoc(doc(getNotebooksRef(), id), { parentNotebookId: newParentId, updatedAt: serverTimestamp() }),
                'Moving notebook',
                () => resyncNotebooks(queryClient)
            );
        },
    });
}

/** Mark a notebook subtree as trashed/restored in the cache right away. */
function patchDeleted(queryClient: QC, ids: string[], deletedAt: string | null) {
    const set = new Set(ids);
    const patch = { deleted_at: deletedAt };
    ids.forEach((id) => notebookOverlay.set(id, patch));
    patchNotebooks(queryClient, (list) => list.map((nb) => (set.has(nb.id) ? { ...nb, deleted_at: deletedAt } : nb)));
    return patch;
}

/**
 * Drop overlay entries once their writes are in Firestore's local cache —
 * only those still owned by this operation (a newer one may have replaced them).
 */
const clearOverlay = (ids: string[], owner: Partial<Notebook> | null) =>
    ids.forEach((id) => {
        if (notebookOverlay.get(id) === owner) notebookOverlay.delete(id);
    });

// Soft delete notebook (cascades to children and notes) — batched writes
export function useSoftDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const ids = await getNotebookSubtree(id, queryClient);
            const owner = patchDeleted(queryClient, ids, new Date().toISOString());

            const work = (async () => {
                const notes = await getNotesOf(ids);
                const deletedAt = serverTimestamp();
                await commitInChunks([
                    ...ids.map((nbId) => ({
                        type: 'update' as const,
                        ref: doc(getNotebooksRef(), nbId),
                        data: { deletedAt },
                    })),
                    ...notes
                        .filter((n) => !n.data().deletedAt)
                        .map((n) => ({ type: 'update' as const, ref: n.ref, data: { deletedAt } })),
                ]);
                queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
            })().finally(() => clearOverlay(ids, owner));
            inBackground(work, 'Moving notebook to trash', () => resyncNotebooks(queryClient));
        },
    });
}

// Restore notebook (cascades to children and notes) — batched writes
export function useRestoreNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const ids = await getNotebookSubtree(id, queryClient);
            const owner = patchDeleted(queryClient, ids, null);

            const work = (async () => {
                const notes = await getNotesOf(ids);
                await commitInChunks([
                    ...ids.map((nbId) => ({
                        type: 'update' as const,
                        ref: doc(getNotebooksRef(), nbId),
                        data: { deletedAt: null },
                    })),
                    ...notes.map((n) => ({ type: 'update' as const, ref: n.ref, data: { deletedAt: null } })),
                ]);
                queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
            })().finally(() => clearOverlay(ids, owner));
            inBackground(work, 'Restoring notebook', () => resyncNotebooks(queryClient));
        },
    });
}

// Permanently delete notebook (cascades) — batched deletes
export function usePermanentlyDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const ids = await getNotebookSubtree(id, queryClient);
            const set = new Set(ids);
            const owner = null;
            ids.forEach((nbId) => notebookOverlay.set(nbId, owner));
            patchNotebooks(queryClient, (list) => list.filter((nb) => !set.has(nb.id)));
            queryClient.setQueryData<Note[]>(['notes', 'trashed'], (old) => old?.filter((n) => !set.has(n.notebook_id)));

            const work = (async () => {
                const notes = await getNotesOf(ids);
                await commitInChunks([
                    ...notes.map((n) => ({ type: 'delete' as const, ref: n.ref })),
                    ...ids.map((nbId) => ({ type: 'delete' as const, ref: doc(getNotebooksRef(), nbId) })),
                ]);
                queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
            })().finally(() => clearOverlay(ids, owner));
            inBackground(work, 'Deleting notebook', () => resyncNotebooks(queryClient));
        },
    });
}
