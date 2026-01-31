import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
    sidebarOpen: boolean;
    selectedNotebookId: string | null;
    selectedNoteId: string | null;
    isTrashView: boolean; // Added for Trash feature
    darkMode: boolean;

    toggleSidebar: () => void;
    selectNotebook: (id: string | null) => void;
    selectNote: (id: string | null) => void;
    setTrashView: (open: boolean) => void; // Added for Trash feature
    toggleDarkMode: () => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            sidebarOpen: true,
            selectedNotebookId: null,
            selectedNoteId: null,
            isTrashView: false,
            darkMode: true,

            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

            selectNotebook: (id) => set({
                selectedNotebookId: id,
                selectedNoteId: null,
                isTrashView: false // Exit trash view when selecting a notebook
            }),

            selectNote: (id) => set({ selectedNoteId: id }),

            setTrashView: (open) => set({
                isTrashView: open,
                selectedNotebookId: null, // Clear notebook selection when in trash
                selectedNoteId: null
            }),

            toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
        }),
        {
            name: 'leo-ui-storage',
        }
    )
);
