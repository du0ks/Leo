import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Note, NewNote } from '../lib/types';

// Fetch notes for a specific notebook
export function useNotes(notebookId: string | null) {
    return useQuery({
        queryKey: ['notes', notebookId],
        queryFn: async (): Promise<Note[]> => {
            if (!notebookId) return [];

            const { data, error } = await supabase
                .from('notes')
                .select('*')
                .eq('notebook_id', notebookId)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            return (data ?? []) as Note[];
        },
        enabled: !!notebookId,
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
                .insert(note)
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

// Update a note
export function useUpdateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, title, content }: { id: string; title?: string; content?: unknown }): Promise<Note> => {
            const { data, error } = await supabase
                .from('notes')
                .update({ title, content })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data as Note;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['notes', data.notebook_id] });
            queryClient.invalidateQueries({ queryKey: ['note', data.id] });
        },
    });
}

// Delete a note
export function useDeleteNote() {
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
        },
    });
}
