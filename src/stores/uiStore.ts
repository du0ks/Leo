import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeColor = 'blue' | 'red' | 'yellow' | 'green' | 'grey' | 'black' | 'purple' | 'pink';

interface UIState {
    sidebarOpen: boolean;
    selectedNotebookId: string | null;
    selectedNoteId: string | null;
    isTrashView: boolean;
    darkMode: boolean;
    themeColor: ThemeColor;
    settingsOpen: boolean;

    toggleSidebar: () => void;
    selectNotebook: (id: string | null) => void;
    selectNote: (id: string | null) => void;
    setTrashView: (open: boolean) => void;
    toggleDarkMode: () => void;
    setDarkMode: (dark: boolean) => void;
    setThemeColor: (color: ThemeColor) => void;
    setSettingsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            sidebarOpen: true,
            selectedNotebookId: null,
            selectedNoteId: null,
            isTrashView: false,
            darkMode: true,
            themeColor: 'blue', // Defaulting to blue as a neutral starting point
            settingsOpen: false,

            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

            selectNotebook: (id) => set({
                selectedNotebookId: id,
                selectedNoteId: null,
                isTrashView: false
            }),

            selectNote: (id) => set({ selectedNoteId: id }),

            setTrashView: (open) => set({
                isTrashView: open,
                selectedNotebookId: null,
                selectedNoteId: null
            }),

            toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
            setDarkMode: (dark) => set({ darkMode: dark }),
            setThemeColor: (color) => set({ themeColor: color }),
            setSettingsOpen: (open) => set({ settingsOpen: open }),
        }),
        {
            name: 'leo-ui-storage',
        }
    )
);
