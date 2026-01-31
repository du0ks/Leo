import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Note, NewNote } from '../lib/types';

// Fetch notes for a specific notebook (excluding deleted)
export function useNotes(notebookId: string | null) {
    return useQuery({
        queryKey: ['notes', notebookId],
        queryFn: async (): Promise<Note[]> => {
            if (!notebookId) return [];

            const { data, error } = await supabase
                .from('notes')
                .select('*')
                .eq('notebook_id', notebookId)
                .is('deleted_at', null)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            return (data ?? []) as Note[];
        },
        enabled: !!notebookId,
    });
}

// Fetch trashed notes
export function useTrashedNotes() {
    return useQuery({
        queryKey: ['notes', 'trashed'],
        queryFn: async (): Promise<Note[]> => {
            const { data, error } = await supabase
                .from('notes')
                .select('*')
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false });

            if (error) throw error;
            return (data ?? []) as Note[];
        },
    });
}

// Fetch a single note
export function useNote(noteId: string | null) {
    return useQuery({
        queryKey: ['note', noteId],
        queryFn: async (): Promise<Note | null> => {
            if (!noteId) return null;

            const { data, error } = await supabase
                .from('notes')
                .select('*')
                .eq('id', noteId)
                .single();

            if (error) throw error;
            return data as Note;
        },
        enabled: !!noteId,
    });
}

// Create a new note
export function useCreateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (note: NewNote): Promise<Note> => {
            const { data, error } = await supabase
                .from('notes')
                .insert(note as any)
                .select()
                .single();

            if (error) throw error;
            return data as Note;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['notes', data.notebook_id] });
        },
    });
}

// Update a note with Optimistic Updates
export function useUpdateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, title, content }: { id: string; title?: string; content?: unknown }): Promise<Note> => {
            const { data, error } = await supabase
                .from('notes')
                .update({ title, content } as any)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data as Note;
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
        onError: (err, updatedNote, context) => {
            if (context?.previousNote) {
                queryClient.setQueryData(['note', updatedNote.id], context.previousNote);
            }
            console.error('Update failed:', err);
        },
        onSettled: (data) => {
            if (data) {
                queryClient.invalidateQueries({ queryKey: ['note', data.id] });
                queryClient.invalidateQueries({ queryKey: ['notes', data.notebook_id] });
            }
        },
    });
}

// Soft delete a note
export function useSoftDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }): Promise<string> => {
            const { error } = await supabase
                .from('notes')
                .update({ deleted_at: new Date().toISOString() } as any)
                .eq('id', id);

            if (error) throw error;
            return notebookId;
        },
        onSuccess: (notebookId) => {
            queryClient.invalidateQueries({ queryKey: ['notes', notebookId] });
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

// Restore a note
export function useRestoreNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }): Promise<string> => {
            const { error } = await supabase
                .from('notes')
                .update({ deleted_at: null } as any)
                .eq('id', id);

            if (error) throw error;
            return notebookId;
        },
        onSuccess: (notebookId) => {
            queryClient.invalidateQueries({ queryKey: ['notes', notebookId] });
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}

// Permanently delete a note
export function usePermanentlyDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, notebookId }: { id: string; notebookId: string }): Promise<string> => {
            const { error } = await supabase
                .from('notes')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return notebookId;
        },
        onSuccess: (notebookId) => {
            queryClient.invalidateQueries({ queryKey: ['notes', notebookId] });
            queryClient.invalidateQueries({ queryKey: ['notes', 'trashed'] });
        },
    });
}
