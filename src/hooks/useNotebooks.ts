import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Notebook, NewNotebook } from '../lib/types';

// Fetch all active notebooks for current user
export function useNotebooks() {
    return useQuery({
        queryKey: ['notebooks'],
        queryFn: async (): Promise<Notebook[]> => {
            const { data, error } = await supabase
                .from('notebooks')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return (data ?? []) as Notebook[];
        },
    });
}

// Fetch trashed notebooks
export function useTrashedNotebooks() {
    return useQuery({
        queryKey: ['notebooks', 'trashed'],
        queryFn: async (): Promise<Notebook[]> => {
            const { data, error } = await supabase
                .from('notebooks')
                .select('*')
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false });

            if (error) throw error;
            return (data ?? []) as Notebook[];
        },
    });
}

// Create a new notebook
export function useCreateNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (notebook: NewNotebook): Promise<Notebook> => {
            const { data, error } = await supabase
                .from('notebooks')
                .insert(notebook as any)
                .select()
                .single();

            if (error) throw error;
            return data as Notebook;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
        },
    });
}

// Update a notebook
export function useUpdateNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, title }: { id: string; title: string }): Promise<Notebook> => {
            const { data, error } = await supabase
                .from('notebooks')
                .update({ title } as any)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data as Notebook;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
        },
    });
}

// Soft delete a notebook
export function useSoftDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<void> => {
            const { error } = await supabase
                .from('notebooks')
                .update({ deleted_at: new Date().toISOString() } as any)
                .eq('id', id);

            if (error) throw error;

            // Also soft delete all notes in this notebook
            await supabase
                .from('notes')
                .update({ deleted_at: new Date().toISOString() } as any)
                .eq('notebook_id', id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
            queryClient.invalidateQueries({ queryKey: ['notes'] });
        },
    });
}

// Restore a notebook
export function useRestoreNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<void> => {
            const { error } = await supabase
                .from('notebooks')
                .update({ deleted_at: null } as any)
                .eq('id', id);

            if (error) throw error;

            await supabase
                .from('notes')
                .update({ deleted_at: null } as any)
                .eq('notebook_id', id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
            queryClient.invalidateQueries({ queryKey: ['notes'] });
        },
    });
}

// Permanently delete a notebook
export function usePermanentlyDeleteNotebook() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<void> => {
            const { error } = await supabase
                .from('notebooks')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notebooks'] });
        },
    });
}
