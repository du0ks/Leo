import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
    collection,
    getDocs,
    doc,
    addDoc,
    updateDoc,
    serverTimestamp,
    onSnapshot,
    type DocumentData,
    type QueryDocumentSnapshot,
    type QuerySnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { commitInChunks, firstSnapshot, toIso } from '../lib/firestoreUtils';
import type { Notebook, NewNotebook } from '../lib/types';

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

const parseAll = (snapshot: QuerySnapshot<DocumentData>, userId: string) =>
    snapshot.docs.map((d) => parseNotebook(d, userId));

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

// Create notebook (supports sub-notebooks)
export function useCreateNotebook() {
    return useMutation({
        mutationFn: async (notebook: NewNotebook): Promise<Notebook> => {
            const safeTitle = sanitizeTitle(notebook.title || 'Untitled') || 'Untitled';
            const docRef = await addDoc(getNotebooksRef(), {
                title: safeTitle,
                parentNotebookId: notebook.parent_notebook_id || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                deletedAt: null,
            });

            const now = new Date().toISOString();
            return {
                id: docRef.id,
                user_id: requireUid(),
                title: safeTitle,
                parent_notebook_id: notebook.parent_notebook_id || null,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            };
        },
    });
}

// Update notebook title
export function useUpdateNotebook() {
    return useMutation({
        mutationFn: async ({ id, title }: { id: string; title: string }) => {
            const safeTitle = sanitizeTitle(title);
            if (!safeTitle) return;
            await updateDoc(doc(getNotebooksRef(), id), {
                title: safeTitle,
                updatedAt: serverTimestamp(),
            });
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
            await updateDoc(doc(getNotebooksRef(), id), {
                parentNotebookId: newParentId,
                updatedAt: serverTimestamp(),
            });
        },
    });
}

// Soft delete notebook (cascades to children and notes) — batched writes
export function useSoftDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const ids = await getNotebookSubtree(id, queryClient);
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
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

// Restore notebook (cascades to children and notes) — batched writes
export function useRestoreNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const ids = await getNotebookSubtree(id, queryClient);
            const notes = await getNotesOf(ids);
            await commitInChunks([
                ...ids.map((nbId) => ({
                    type: 'update' as const,
                    ref: doc(getNotebooksRef(), nbId),
                    data: { deletedAt: null },
                })),
                ...notes.map((n) => ({ type: 'update' as const, ref: n.ref, data: { deletedAt: null } })),
            ]);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

// Permanently delete notebook (cascades) — batched deletes
export function usePermanentlyDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const ids = await getNotebookSubtree(id, queryClient);
            const notes = await getNotesOf(ids);
            await commitInChunks([
                ...notes.map((n) => ({ type: 'delete' as const, ref: n.ref })),
                ...ids.map((nbId) => ({ type: 'delete' as const, ref: doc(getNotebooksRef(), nbId) })),
            ]);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}
