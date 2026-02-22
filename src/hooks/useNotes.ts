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
    writeBatch,
    serverTimestamp,
    Timestamp,
    onSnapshot,
    where
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { Note, NewNote } from '../lib/types';

// Security: Input validation constants
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_SIZE_BYTES = 500_000; // 500KB

const sanitizeTitle = (title: string): string => {
    const stripped = title.replace(/<[^>]*>/g, '').trim();
    return stripped.slice(0, MAX_TITLE_LENGTH);
};

const validateContent = (content: unknown): unknown => {
    if (content === undefined || content === null) return [];
    if (!Array.isArray(content)) {
        throw new Error('Invalid note content format');
    }

    // Stringify to calculate size AND strip undefined values automatically
    const serialized = JSON.stringify(content);
    if (serialized.length > MAX_CONTENT_SIZE_BYTES) {
        throw new Error(`Note content exceeds maximum size of ${MAX_CONTENT_SIZE_BYTES / 1000}KB`);
    }

    // Recursively remove `undefined` keys by parsing the serialized string. 
    // This solves the Firestore "Unsupported field value: undefined" error when deeply nested undefined properties exist.
    return JSON.parse(serialized);
};

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
                .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })) as Note[];
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
                .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })) as Note[];

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

            // 2. Fetch ONLY deleted notes from each notebook using a query to save reads
            const allTrashedNotes: Note[] = [];
            for (const nbDoc of notebooksSnapshot.docs) {
                const notesRef = collection(db, 'users', userId, 'notebooks', nbDoc.id, 'notes');
                const trashedQuery = query(notesRef, where('deletedAt', '!=', null));
                const snp = await getDocs(trashedQuery);

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

            return {
                id: docRef.id,
                notebook_id: note.notebook_id,
                title: safeTitle,
                content: safeContent,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                deleted_at: null,
            };
        },
        onSuccess: () => {
            // Real-time snapshot handles note updates
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

            // Helper to find undefined paths in an object for debugging data loss issues
            const findUndefinedPaths = (obj: any, path: string = ''): string[] => {
                let paths: string[] = [];
                if (obj === undefined) return [path || 'root'];
                if (obj === null || typeof obj !== 'object') return paths;

                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        const currentPath = path ? `${path}.${key}` : key;
                        if (obj[key] === undefined) {
                            paths.push(currentPath);
                        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                            paths.push(...findUndefinedPaths(obj[key], currentPath));
                        }
                    }
                }
                return paths;
            };

            const updates: { updatedAt: ReturnType<typeof serverTimestamp>; title?: string; content?: unknown } = {
                updatedAt: serverTimestamp(),
            };

            if (title !== undefined) updates.title = sanitizeTitle(title);
            if (content !== undefined) {
                // Debug logging to find the source of 'undefined' properties before they are stripped
                const undefinedPaths = findUndefinedPaths(content, 'content');
                if (undefinedPaths.length > 0) {
                    console.warn(`[useUpdateNote] Found undefined values in payload at paths:`, undefinedPaths);
                }

                updates.content = validateContent(content);
            }

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
        // Note: We intentionally DON'T invalidate queries here.
        // The real-time snapshot listener will sync data when Firestore propagates the write.
        // Calling invalidateQueries immediately can cause a race condition where we refetch
        // stale data before the write has propagated, causing data loss during rapid edits.
        onSuccess: () => {
            // No-op: rely on snapshot listeners and optimistic updates
        },
        onError: (err, newNote, context) => {
            console.error('[useUpdateNote] Mutation failed! Rolling back optimistic update.', err);
            if (context?.previousNote) {
                queryClient.setQueryData(['note', newNote.id], context.previousNote);
            }
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
        onSuccess: () => {
            // Active notes handle updates via onSnapshot, only manual fetch needs invalidation
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
        onSuccess: () => {
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

// Move note to a different notebook
export function useMoveNote() {
    return useMutation({
        mutationFn: async ({
            id,
            fromNotebookId,
            toNotebookId
        }: {
            id: string;
            fromNotebookId: string;
            toNotebookId: string;
        }) => {
            // Get the original note data
            const oldDocRef = doc(getNotesRef(fromNotebookId), id);
            const oldDocSnap = await getDoc(oldDocRef);

            if (!oldDocSnap.exists()) {
                throw new Error('Note not found');
            }

            const noteData = oldDocSnap.data();

            // LOW-1 fix: Use batch write for atomicity (prevents data loss if partial failure)
            const batch = writeBatch(db);

            // Create note in new notebook
            const newDocRef = doc(getNotesRef(toNotebookId));
            batch.set(newDocRef, {
                ...noteData,
                updatedAt: serverTimestamp(),
            });

            // Delete from old notebook
            batch.delete(oldDocRef);

            // Commit both operations atomically
            await batch.commit();

            return {
                oldId: id,
                newId: newDocRef.id,
                fromNotebookId,
                toNotebookId
            };
        },
        onSuccess: () => {
            // Real-time snapshot handles re-fetching for active notebooks
        },
    });
}
