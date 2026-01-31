import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Notebook, NewNotebook } from '../lib/types';

// Fetch all notebooks for current user
export function useNotebooks() {
    return useQuery({
        queryKey: ['notebooks'],
        queryFn: async (): Promise<Notebook[]> => {
            const { data, error } = await supabase
                .from('notebooks')
                .select('*')
                .order('created_at', { ascending: false });

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
                .insert(notebook)
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
                .update({ title })
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

// Delete a notebook
export function useDeleteNotebook() {
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
            queryClient.invalidateQueries({ queryKey: ['notes'] });
        },
    });
}
