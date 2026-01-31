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
    created_at: string;
    updated_at: string;
}

export interface Note {
    id: string;
    notebook_id: string;
    title: string;
    content: unknown; // BlockNote JSON
    created_at: string;
    updated_at: string;
}

export interface NewNotebook {
    user_id: string;
    title?: string;
}

export interface NewNote {
    notebook_id: string;
    title?: string;
    content?: unknown;
}
