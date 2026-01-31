import { create } from 'zustand';

interface UIState {
    // Sidebar
    sidebarOpen: boolean;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;

    // Selection
    selectedNotebookId: string | null;
    selectedNoteId: string | null;
    selectNotebook: (id: string | null) => void;
    selectNote: (id: string | null) => void;

    // Theme
    darkMode: boolean;
    toggleDarkMode: () => void;
    setDarkMode: (dark: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
    // Sidebar
    sidebarOpen: true,
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),

    // Selection
    selectedNotebookId: null,
    selectedNoteId: null,
    selectNotebook: (id) => set({ selectedNotebookId: id, selectedNoteId: null }),
    selectNote: (id) => set({ selectedNoteId: id }),

    // Theme - initialize from system preference
    darkMode: typeof window !== 'undefined'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : true,
    toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
    setDarkMode: (dark) => set({ darkMode: dark }),
}));
