import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import {
    collection,
    query,
    getDocs,
    getDoc,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    Timestamp,
    onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { Note, NewNote } from '../lib/types';

// Helper to get notes collection for a notebook
const getNotesRef = (notebookId: string) => {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Not authenticated');
    return collection(db, 'users', userId, 'notebooks', notebookId, 'notes');
};

// Fetch notes for a specific notebook with real-time sync
export function useNotes(notebookId: string | null) {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;

    // Use useQuery for the data structure and initial state
    const { data, ...queryResult } = useQuery({
        queryKey: ['notes', notebookId],
        queryFn: async (): Promise<Note[]> => {
            // Initial fetch is still useful for loading state, but onSnapshot handles updates
            const q = query(getNotesRef(notebookId!));
            const snapshot = await getDocs(q);
            return snapshot.docs
                .map(docSnap => {
                    const data = docSnap.data({ serverTimestamps: 'estimate' });
                    return {
                        id: docSnap.id,
                        notebook_id: notebookId!,
                        title: data.title,
                        content: data.content,
                        created_at: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                        updated_at: (data.updatedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                        deleted_at: data.deletedAt ? (data.deletedAt as Timestamp).toDate().toISOString() : null,
                    };
                })
                .filter(n => n.deleted_at === null)
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) as Note[];
        },
        enabled: !!notebookId && !!userId,
        staleTime: Infinity, // Rely on snapshot updates
    });

    // Real-time subscription
    React.useEffect(() => {
        if (!notebookId || !userId) return;

        const q = query(getNotesRef(notebookId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notes = snapshot.docs
                .map(docSnap => {
                    const data = docSnap.data({ serverTimestamps: 'estimate' });
                    return {
                        id: docSnap.id,
                        notebook_id: notebookId,
                        title: data.title,
                        content: data.content,
                        created_at: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                        updated_at: (data.updatedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                        deleted_at: data.deletedAt ? (data.deletedAt as Timestamp).toDate().toISOString() : null,
                    };
                })
                .filter(n => n.deleted_at === null)
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) as Note[];

            queryClient.setQueryData(['notes', notebookId], notes);
        }, (error) => {
            console.error("Error in notes snapshot listener:", error);
        });

        return () => unsubscribe();
    }, [notebookId, userId, queryClient]);

    return { data, ...queryResult };
}

// Fetch trashed notes across all notebooks
export function useTrashedNotes() {
    return useQuery({
        queryKey: ['notes', 'trashed'],
        queryFn: async (): Promise<Note[]> => {
            const userId = auth.currentUser?.uid;
            if (!userId) return [];

            // 1. Get all notebooks
            const notebooksRef = collection(db, 'users', userId, 'notebooks');
            const notebooksSnapshot = await getDocs(notebooksRef);

            // 2. Fetch all notes from each notebook and filter in JS
            const allTrashedNotes: Note[] = [];
            for (const nbDoc of notebooksSnapshot.docs) {
                const notesRef = collection(db, 'users', userId, 'notebooks', nbDoc.id, 'notes');
                const snp = await getDocs(notesRef);

                snp.docs.forEach(docSnap => {
                    const data = docSnap.data({ serverTimestamps: 'estimate' });
                    const deletedAtStr = data.deletedAt ? (data.deletedAt as Timestamp).toDate().toISOString() : null;

                    if (deletedAtStr) {
                        allTrashedNotes.push({
                            id: docSnap.id,
                            notebook_id: nbDoc.id,
                            title: data.title,
                            content: data.content,
                            created_at: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                            updated_at: (data.updatedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                            deleted_at: deletedAtStr,
                        });
                    }
                });
            }

            return allTrashedNotes.sort((a, b) =>
                new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime()
            );
        },
        enabled: !!auth.currentUser,
    });
}

// Fetch a single note
// Fetch a single note
export function useNote(noteId: string | null, notebookId?: string | null) {
    const queryClient = useQueryClient();
    const userId = auth.currentUser?.uid;

    const { data, ...queryResult } = useQuery({
        queryKey: ['note', noteId],
        queryFn: async (): Promise<Note | null> => {
            if (!noteId || !notebookId) return null;
            const docRef = doc(getNotesRef(notebookId), noteId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) return null;

            const data = docSnap.data({ serverTimestamps: 'estimate' });
            return {
                id: docSnap.id,
                notebook_id: notebookId,
                title: data.title,
                content: data.content,
                created_at: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                updated_at: (data.updatedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                deleted_at: data.deletedAt ? (data.deletedAt as Timestamp).toDate().toISOString() : null,
            } as Note;
        },
        enabled: !!noteId && !!notebookId && !!userId,
        staleTime: Infinity,
    });

    React.useEffect(() => {
        if (!noteId || !notebookId || !userId) return;

        const docRef = doc(getNotesRef(notebookId), noteId);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data({ serverTimestamps: 'estimate' });
                const updatedNote = {
                    id: docSnap.id,
                    notebook_id: notebookId,
                    title: data.title,
                    content: data.content,
                    created_at: (data.createdAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                    updated_at: (data.updatedAt as Timestamp)?.toDate().toISOString() || new Date().toISOString(),
                    deleted_at: data.deletedAt ? (data.deletedAt as Timestamp).toDate().toISOString() : null,
                } as Note;

                queryClient.setQueryData(['note', noteId], updatedNote);
            }
        }, (error) => {
            console.error("Error in note snapshot listener:", error);
        });

        return () => unsubscribe();
    }, [noteId, notebookId, userId, queryClient]);

    return { data, ...queryResult };
}

// Mutations
export function useCreateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (note: NewNote): Promise<Note> => {
            const docRef = await addDoc(getNotesRef(note.notebook_id), {
                title: note.title || 'Untitled',
                content: note.content || [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                deletedAt: null,
            });

            return {
                id: docRef.id,
                notebook_id: note.notebook_id,
                title: note.title || 'Untitled',
                content: note.content || [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                deleted_at: null,
            };
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['notes', variables.notebook_id] });
        },
    });
}

export function useUpdateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            notebookId,
            title,
            content
        }: {
            id: string;
            notebookId: string;
            title?: string;
            content?: unknown
        }) => {
            const docRef = doc(getNotesRef(notebookId), id);

            const updates: { updatedAt: ReturnType<typeof serverTimestamp>; title?: string; content?: unknown } = {
                updatedAt: serverTimestamp(),
            };
            if (title !== undefined) updates.title = title;
            if (content !== undefined) updates.content = content;

            await updateDoc(docRef, updates);
            return { id, notebookId };
        },
        onMutate: async (updatedNote) => {
            await queryClient.cancelQueries({ queryKey: ['note', updatedNote.id] });
            const previousNote = queryClient.getQueryData(['note', updatedNote.id]);

            if (previousNote) {
                queryClient.setQueryData(['note', updatedNote.id], (old: any) => ({
                    ...old,
                    ...updatedNote,
                    updated_at: new Date().toISOString(),
                }));
            }

            return { previousNote };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['note', data!!.id] });
            queryClient.invalidateQueries({ queryKey: ['notes', data!!.notebookId] });
        },
    });
}

export function useSoftDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            const docRef = doc(getNotesRef(notebookId), id);
            await updateDoc(docRef, {
                deletedAt: serverTimestamp(),
            });
            return { id, notebookId };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['notes', data.notebookId] });
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

export function useRestoreNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            const docRef = doc(getNotesRef(notebookId), id);
            await updateDoc(docRef, {
                deletedAt: null,
            });
            return { id, notebookId };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['notes', data.notebookId] });
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

export function usePermanentlyDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            const docRef = doc(getNotesRef(notebookId), id);
            await deleteDoc(docRef);
            return { id, notebookId };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}
