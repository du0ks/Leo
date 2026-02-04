import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import {
    collection,
    query,
    getDocs,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    Timestamp,
    onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { Notebook, NewNotebook } from '../lib/types';

// Helper to get user's notebooks collection
const getNotebooksRef = () => {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Not authenticated');
    return collection(db, 'users', userId, 'notebooks');
};

// Parse notebook from Firestore document
const parseNotebook = (docSnap: any, userId: string): Notebook => {
    const data = docSnap.data({ serverTimestamps: 'estimate' });
    return {
        id: docSnap.id,
        user_id: userId,
        title: data.title,
        parent_notebook_id: data.parentNotebookId || null,
        created_at: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
        updated_at: (data.updatedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
        deleted_at: data.deletedAt ? (data.deletedAt as Timestamp).toDate().toISOString() : null,
    };
};

// Fetch all active notebooks with real-time sync
export function useNotebooks() {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;

    const { data, ...queryResult } = useQuery({
        queryKey: ['notebooks'],
        queryFn: async (): Promise<Notebook[]> => {
            const q = query(getNotebooksRef());
            const snapshot = await getDocs(q);

            return snapshot.docs
                .map(docSnap => parseNotebook(docSnap, auth.currentUser?.uid || ''))
                .filter(nb => nb.deleted_at === null)
                .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
        },
        enabled: !!userId,
        staleTime: Infinity
    });

    React.useEffect(() => {
        if (!userId) return;

        const q = query(getNotebooksRef());
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notebooks = snapshot.docs
                .map(docSnap => parseNotebook(docSnap, userId))
                .filter(nb => nb.deleted_at === null)
                .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

            queryClient.setQueryData(['notebooks'], notebooks);
        }, (error) => {
            console.error("Error in notebooks snapshot listener:", error);
        });

        return () => unsubscribe();
    }, [userId, queryClient]);

    return { data, ...queryResult };
}

// Fetch trashed notebooks
export function useTrashedNotebooks() {
    return useQuery({
        queryKey: ['notebooks', 'trashed'],
        queryFn: async (): Promise<Notebook[]> => {
            const q = query(getNotebooksRef());
            const snapshot = await getDocs(q);

            return snapshot.docs
                .map(docSnap => parseNotebook(docSnap, auth.currentUser?.uid || ''))
                .filter(nb => nb.deleted_at !== null)
                .sort((a, b) => new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime());
        },
        enabled: !!auth.currentUser,
    });
}

// Helper: Get all descendant notebook IDs (for cascading operations)
async function getDescendantNotebookIds(notebookId: string, allNotebooks: Notebook[]): Promise<string[]> {
    const descendants: string[] = [];
    const directChildren = allNotebooks.filter(nb => nb.parent_notebook_id === notebookId);

    for (const child of directChildren) {
        descendants.push(child.id);
        const childDescendants = await getDescendantNotebookIds(child.id, allNotebooks);
        descendants.push(...childDescendants);
    }

    return descendants;
}

// Create notebook (supports sub-notebooks)
export function useCreateNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (notebook: NewNotebook): Promise<Notebook> => {
            const docRef = await addDoc(getNotebooksRef(), {
                title: notebook.title || 'Untitled',
                parentNotebookId: notebook.parent_notebook_id || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                deletedAt: null,
            });

            return {
                id: docRef.id,
                user_id: auth.currentUser!.uid,
                title: notebook.title || 'Untitled',
                parent_notebook_id: notebook.parent_notebook_id || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                deleted_at: null,
            };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
        },
    });
}

// Update notebook (title or parent)
export function useUpdateNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, title, parent_notebook_id }: {
            id: string;
            title?: string;
            parent_notebook_id?: string | null;
        }) => {
            const docRef = doc(getNotebooksRef(), id);
            const updates: any = { updatedAt: serverTimestamp() };

            if (title !== undefined) updates.title = title;
            if (parent_notebook_id !== undefined) updates.parentNotebookId = parent_notebook_id;

            await updateDoc(docRef, updates);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
        },
    });
}

// Move notebook to different parent (or to root)
export function useMoveNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, newParentId }: { id: string; newParentId: string | null }) => {
            const docRef = doc(getNotebooksRef(), id);
            await updateDoc(docRef, {
                parentNotebookId: newParentId,
                updatedAt: serverTimestamp(),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
        },
    });
}

// Soft delete notebook (cascades to children and notes)
export function useSoftDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const userId = auth.currentUser!.uid;

            // Get all notebooks to find descendants
            const allNotebooksSnapshot = await getDocs(getNotebooksRef());
            const allNotebooks = allNotebooksSnapshot.docs
                .map(docSnap => parseNotebook(docSnap, userId));

            // Get all descendant notebook IDs
            const descendantIds = await getDescendantNotebookIds(id, allNotebooks);
            const allNotebookIds = [id, ...descendantIds];

            // Soft delete all notebooks
            for (const nbId of allNotebookIds) {
                const docRef = doc(getNotebooksRef(), nbId);
                await updateDoc(docRef, { deletedAt: serverTimestamp() });

                // Soft delete all notes in this notebook
                const notesRef = collection(db, 'users', userId, 'notebooks', nbId, 'notes');
                const notesSnapshot = await getDocs(notesRef);
                const deletePromises = notesSnapshot.docs.map(noteDoc =>
                    updateDoc(doc(notesRef, noteDoc.id), { deletedAt: serverTimestamp() })
                );
                await Promise.all(deletePromises);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
            queryClient.invalidateQueries({ queryKey: ['notes'] });
        },
    });
}

// Restore notebook (cascades to children and notes)
export function useRestoreNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const userId = auth.currentUser!.uid;

            // Get all notebooks to find descendants
            const allNotebooksSnapshot = await getDocs(getNotebooksRef());
            const allNotebooks = allNotebooksSnapshot.docs
                .map(docSnap => parseNotebook(docSnap, userId));

            // Get all descendant notebook IDs
            const descendantIds = await getDescendantNotebookIds(id, allNotebooks);
            const allNotebookIds = [id, ...descendantIds];

            // Restore all notebooks
            for (const nbId of allNotebookIds) {
                const docRef = doc(getNotebooksRef(), nbId);
                await updateDoc(docRef, { deletedAt: null });

                // Restore all notes
                const notesRef = collection(db, 'users', userId, 'notebooks', nbId, 'notes');
                const notesSnapshot = await getDocs(notesRef);
                const restorePromises = notesSnapshot.docs.map(noteDoc =>
                    updateDoc(doc(notesRef, noteDoc.id), { deletedAt: null })
                );
                await Promise.all(restorePromises);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
            queryClient.invalidateQueries({ queryKey: ['notes'] });
        },
    });
}

// Permanently delete notebook (cascades)
export function usePermanentlyDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const userId = auth.currentUser!.uid;

            // Get all notebooks to find descendants
            const allNotebooksSnapshot = await getDocs(getNotebooksRef());
            const allNotebooks = allNotebooksSnapshot.docs
                .map(docSnap => parseNotebook(docSnap, userId));

            // Get all descendant notebook IDs
            const descendantIds = await getDescendantNotebookIds(id, allNotebooks);
            const allNotebookIds = [id, ...descendantIds];

            // Delete all notebooks (start from deepest children)
            for (const nbId of [...allNotebookIds].reverse()) {
                // Delete all notes first
                const notesRef = collection(db, 'users', userId, 'notebooks', nbId, 'notes');
                const notesSnapshot = await getDocs(notesRef);
                const deletePromises = notesSnapshot.docs.map(noteDoc =>
                    deleteDoc(doc(notesRef, noteDoc.id))
                );
                await Promise.all(deletePromises);

                // Then delete the notebook
                await deleteDoc(doc(getNotebooksRef(), nbId));
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
        },
    });
}
