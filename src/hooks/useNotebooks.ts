import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { Notebook, NewNotebook } from '../lib/types';

// Helper to get user's notebooks collection
const getNotebooksRef = () => {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Not authenticated');
    return collection(db, 'users', userId, 'notebooks');
};

// Fetch all active notebooks
export function useNotebooks() {
    return useQuery({
        queryKey: ['notebooks'],
        queryFn: async (): Promise<Notebook[]> => {
            const q = query(getNotebooksRef()); // Simplified to avoid index errors
            const snapshot = await getDocs(q);

            return snapshot.docs
                .map(docSnap => {
                    const data = docSnap.data({ serverTimestamps: 'estimate' });
                    return {
                        id: docSnap.id,
                        user_id: auth.currentUser?.uid || '',
                        title: data.title,
                        created_at: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                        updated_at: (data.updatedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                        deleted_at: data.deletedAt ? (data.deletedAt as Timestamp).toDate().toISOString() : null,
                    };
                })
                .filter(nb => nb.deleted_at === null) // Client-side filtering
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as Notebook[];
        },
        enabled: !!auth.currentUser,
    });
}

// Fetch trashed notebooks
export function useTrashedNotebooks() {
    return useQuery({
        queryKey: ['notebooks', 'trashed'],
        queryFn: async (): Promise<Notebook[]> => {
            const q = query(getNotebooksRef());
            const snapshot = await getDocs(q);

            return snapshot.docs
                .map(docSnap => {
                    const data = docSnap.data({ serverTimestamps: 'estimate' });
                    return {
                        id: docSnap.id,
                        user_id: auth.currentUser?.uid || '',
                        title: data.title,
                        created_at: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                        updated_at: (data.updatedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                        deleted_at: data.deletedAt ? (data.deletedAt as Timestamp).toDate().toISOString() : null,
                    };
                })
                .filter(nb => nb.deleted_at !== null)
                .sort((a, b) => new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime()) as Notebook[];
        },
        enabled: !!auth.currentUser,
    });
}

// Create notebook
export function useCreateNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (notebook: NewNotebook): Promise<Notebook> => {
            const docRef = await addDoc(getNotebooksRef(), {
                title: notebook.title || 'Untitled',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                deletedAt: null,
            });

            return {
                id: docRef.id,
                user_id: auth.currentUser!.uid,
                title: notebook.title || 'Untitled',
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

// Update notebook
export function useUpdateNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, title }: { id: string; title: string }) => {
            const docRef = doc(getNotebooksRef(), id);
            await updateDoc(docRef, {
                title,
                updatedAt: serverTimestamp(),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
        },
    });
}

// Soft delete notebook
export function useSoftDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const docRef = doc(getNotebooksRef(), id);
            await updateDoc(docRef, {
                deletedAt: serverTimestamp(),
            });

            // Also soft delete all notes in this notebook
            const notesRef = collection(db, 'users', auth.currentUser!.uid, 'notebooks', id, 'notes');
            const notesSnapshot = await getDocs(notesRef);

            const deletePromises = notesSnapshot.docs.map(noteDoc =>
                updateDoc(doc(notesRef, noteDoc.id), { deletedAt: serverTimestamp() })
            );
            await Promise.all(deletePromises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
            queryClient.invalidateQueries({ queryKey: ['notes'] });
        },
    });
}

// Restore notebook
export function useRestoreNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const docRef = doc(getNotebooksRef(), id);
            await updateDoc(docRef, { deletedAt: null });

            // Also restore all notes
            const notesRef = collection(db, 'users', auth.currentUser!.uid, 'notebooks', id, 'notes');
            const notesSnapshot = await getDocs(notesRef);

            const restorePromises = notesSnapshot.docs.map(noteDoc =>
                updateDoc(doc(notesRef, noteDoc.id), { deletedAt: null })
            );
            await Promise.all(restorePromises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
            queryClient.invalidateQueries({ queryKey: ['notes'] });
        },
    });
}

// Permanently delete notebook
export function usePermanentlyDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            // First delete all notes in the notebook
            const notesRef = collection(db, 'users', auth.currentUser!.uid, 'notebooks', id, 'notes');
            const notesSnapshot = await getDocs(notesRef);

            const deletePromises = notesSnapshot.docs.map(noteDoc =>
                deleteDoc(doc(notesRef, noteDoc.id))
            );
            await Promise.all(deletePromises);

            // Then delete the notebook
            await deleteDoc(doc(getNotebooksRef(), id));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
        },
    });
}
