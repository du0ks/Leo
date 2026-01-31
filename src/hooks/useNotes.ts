import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    getDoc,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { Note, NewNote } from '../lib/types';

// Helper to get notes collection for a notebook
const getNotesRef = (notebookId: string) => {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('Not authenticated');
    return collection(db, 'users', userId, 'notebooks', notebookId, 'notes');
};

// Fetch notes for a notebook
export function useNotes(notebookId: string | null) {
    return useQuery({
        queryKey: ['notes', notebookId],
        queryFn: async (): Promise<Note[]> => {
            if (!notebookId) return [];

            const q = query(
                getNotesRef(notebookId),
                where('deletedAt', '==', null),
                orderBy('updatedAt', 'desc')
            );

            const snapshot = await getDocs(q);
            return snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                notebook_id: notebookId,
                title: docSnap.data().title,
                content: docSnap.data().content,
                created_at: (docSnap.data().createdAt as Timestamp).toDate().toISOString(),
                updated_at: (docSnap.data().updatedAt as Timestamp).toDate().toISOString(),
                deleted_at: null,
            })) as Note[];
        },
        enabled: !!notebookId && !!auth.currentUser,
    });
}

// Fetch trashed notes (across all notebooks)
export function useTrashedNotes() {
    return useQuery({
        queryKey: ['notes', 'trashed'],
        queryFn: async (): Promise<Note[]> => {
            const userId = auth.currentUser?.uid;
            if (!userId) return [];

            // Need to fetch all notebooks first, then get trashed notes
            const notebooksRef = collection(db, 'users', userId, 'notebooks');
            const notebooksSnapshot = await getDocs(notebooksRef);

            const trashedNotes: Note[] = [];

            for (const notebookDoc of notebooksSnapshot.docs) {
                const notesRef = collection(notebookDoc.ref, 'notes');
                const q = query(
                    notesRef,
                    where('deletedAt', '!=', null),
                    orderBy('deletedAt', 'desc')
                );

                const notesSnapshot = await getDocs(q);
                notesSnapshot.docs.forEach(noteDoc => {
                    trashedNotes.push({
                        id: noteDoc.id,
                        notebook_id: notebookDoc.id,
                        title: noteDoc.data().title,
                        content: noteDoc.data().content,
                        created_at: (noteDoc.data().createdAt as Timestamp).toDate().toISOString(),
                        updated_at: (noteDoc.data().updatedAt as Timestamp).toDate().toISOString(),
                        deleted_at: (noteDoc.data().deletedAt as Timestamp).toDate().toISOString(),
                    } as Note);
                });
            }

            // Sort by deletedAt desc
            return trashedNotes.sort((a, b) =>
                new Date(b.deleted_at!).getTime() - new Date(a.deleted_at!).getTime()
            );
        },
    });
}

// Fetch single note
export function useNote(noteId: string | null, notebookId?: string | null) {
    return useQuery({
        queryKey: ['note', noteId],
        queryFn: async (): Promise<Note | null> => {
            if (!noteId || !notebookId) return null;

            const docRef = doc(getNotesRef(notebookId), noteId);
            const snapshot = await getDoc(docRef);

            if (!snapshot.exists()) return null;

            const data = snapshot.data();
            return {
                id: snapshot.id,
                notebook_id: notebookId,
                title: data.title,
                content: data.content,
                created_at: (data.createdAt as Timestamp).toDate().toISOString(),
                updated_at: (data.updatedAt as Timestamp).toDate().toISOString(),
                deleted_at: data.deletedAt ? (data.deletedAt as Timestamp).toDate().toISOString() : null,
            };
        },
        enabled: !!noteId && !!notebookId && !!auth.currentUser,
    });
}

// Create note
export function useCreateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (note: NewNote): Promise<Note> => {
            const docRef = await addDoc(getNotesRef(note.notebook_id), {
                title: note.title || 'Untitled',
                content: note.content || {},
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                deletedAt: null,
            });

            return {
                id: docRef.id,
                notebook_id: note.notebook_id,
                title: note.title || 'Untitled',
                content: note.content || {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                deleted_at: null,
            };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['notes', data.notebook_id] });
        },
    });
}

// Update note
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

            queryClient.setQueryData(['note', updatedNote.id], (old: Note | undefined) => {
                if (!old) return old;
                return { ...old, ...updatedNote };
            });

            return { previousNote };
        },
        onError: (_err, updatedNote, context) => {
            if (context?.previousNote) {
                queryClient.setQueryData(['note', updatedNote.id], context.previousNote);
            }
        },
        onSettled: (data) => {
            if (data) {
                queryClient.invalidateQueries({ queryKey: ['note', data.id] });
                queryClient.invalidateQueries({ queryKey: ['notes', data.notebookId] });
            }
        },
    });
}

// Soft delete note
export function useSoftDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            const docRef = doc(getNotesRef(notebookId), id);
            await updateDoc(docRef, { deletedAt: serverTimestamp() });
            return notebookId;
        },
        onSuccess: (notebookId) => {
            queryClient.invalidateQueries({ queryKey: ['notes', notebookId] });
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

// Restore note
export function useRestoreNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            const docRef = doc(getNotesRef(notebookId), id);
            await updateDoc(docRef, { deletedAt: null });
            return notebookId;
        },
        onSuccess: (notebookId) => {
            queryClient.invalidateQueries({ queryKey: ['notes', notebookId] });
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

// Permanently delete note
export function usePermanentlyDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }) => {
            await deleteDoc(doc(getNotesRef(notebookId), id));
            return notebookId;
        },
        onSuccess: (notebookId) => {
            queryClient.invalidateQueries({ queryKey: ['notes', notebookId] });
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}
