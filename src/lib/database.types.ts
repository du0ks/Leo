// Database types for Supabase
// These types define the schema for your Supabase tables

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    email: string | null;
                    display_name: string | null;
                    created_at: string;
                };
                Insert: {
                    id: string;
                    email?: string | null;
                    display_name?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    email?: string | null;
                    display_name?: string | null;
                    created_at?: string;
                };
                Relationships: [];
            };
            notebooks: {
                Row: {
                    id: string;
                    user_id: string;
                    title: string;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    title?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    title?: string;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "notebooks_user_id_fkey";
                        columns: ["user_id"];
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    }
                ];
            };
            notes: {
                Row: {
                    id: string;
                    notebook_id: string;
                    title: string;
                    content: unknown;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    notebook_id: string;
                    title?: string;
                    content?: unknown;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    notebook_id?: string;
                    title?: string;
                    content?: unknown;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "notes_notebook_id_fkey";
                        columns: ["notebook_id"];
                        referencedRelation: "notebooks";
                        referencedColumns: ["id"];
                    }
                ];
            };
        };
        Views: {};
        Functions: {};
        Enums: {};
        CompositeTypes: {};
    };
}
