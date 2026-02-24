// Convenience types for the app
export interface Profile {
    id: string;
    email: string | null;
    display_name: string | null;
    created_at: string;
}

export interface Notebook {
    id: string;
    user_id: string;
    title: string;
    parent_notebook_id: string | null; // null = root notebook, string = sub-notebook
    created_at: string;
    updated_at: string;
    deleted_at: string | null; // Soft delete timestamp
}

export interface Note {
    id: string;
    notebook_id: string;
    title: string;
    content: unknown; // BlockNote JSON
    created_at: string;
    updated_at: string;
    deleted_at: string | null; // Soft delete timestamp
}

export interface NewNotebook {
    user_id: string;
    title?: string;
    parent_notebook_id?: string | null; // For creating sub-notebooks
}

export interface NewNote {
    notebook_id: string;
    title?: string;
    content?: unknown;
}
