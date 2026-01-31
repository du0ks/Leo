import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// import { enableMapSet } from 'immer';

// Allow Map/Set in Immer (if we used immer, but zustand/persist handles simpler types better. 
// Sets don't persist well in JSON without transformation. 
// I'll use an Array for 'expandedNotebooks' in the persisted state to be safe).

export type ThemeColor = 'blue' | 'red' | 'yellow' | 'green' | 'grey' | 'black' | 'purple' | 'pink';

interface UIState {
    sidebarOpen: boolean;
    expandedNotebooks: Set<string>; // IDs of expanded notebooks
    selectedNoteId: string | null;
    selectedNotebookId: string | null; // Needed for Firebase subcollection queries
    isTrashView: boolean;
    darkMode: boolean;
    themeColor: ThemeColor;
    settingsOpen: boolean;

    toggleSidebar: () => void;
    toggleNotebookExpand: (id: string, forceState?: boolean) => void;
    selectNote: (noteId: string | null, notebookId?: string | null, isTrash?: boolean) => void;

    toggleDarkMode: () => void;
    setDarkMode: (dark: boolean) => void;
    setThemeColor: (color: ThemeColor) => void;
    setSettingsOpen: (open: boolean) => void;
}

// Custom storage wrapper to handle Set serialization
const storage = {
    getItem: (name: string) => {
        const str = localStorage.getItem(name);
        if (!str) return null;
        const { state } = JSON.parse(str);
        return {
            state: {
                ...state,
                expandedNotebooks: new Set(state.expandedNotebooks || []),
            },
        };
    },
    setItem: (name: string, value: any) => {
        const serializedState = {
            ...value.state,
            expandedNotebooks: Array.from(value.state.expandedNotebooks),
        };
        localStorage.setItem(name, JSON.stringify({ state: serializedState }));
    },
    removeItem: (name: string) => localStorage.removeItem(name),
};

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            sidebarOpen: true,
            expandedNotebooks: new Set(),
            selectedNoteId: null,
            selectedNotebookId: null,
            isTrashView: false,
            darkMode: true,
            themeColor: 'blue',
            settingsOpen: false,

            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

            toggleNotebookExpand: (id, forceState) => set((state) => {
                const newSet = new Set(state.expandedNotebooks);
                if (forceState !== undefined) {
                    if (forceState) newSet.add(id);
                    else newSet.delete(id);
                } else {
                    if (newSet.has(id)) newSet.delete(id);
                    else newSet.add(id);
                }
                return { expandedNotebooks: newSet };
            }),

            selectNote: (noteId, notebookId, isTrash = false) => set({
                selectedNoteId: noteId,
                selectedNotebookId: notebookId ?? null,
                isTrashView: isTrash
            }),

            toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
            setDarkMode: (dark) => set({ darkMode: dark }),
            setThemeColor: (color) => set({ themeColor: color }),
            setSettingsOpen: (open) => set({ settingsOpen: open }),
        }),
        {
            name: 'leo-ui-storage',
            storage: storage, // Use custom storage
        }
    )
);
