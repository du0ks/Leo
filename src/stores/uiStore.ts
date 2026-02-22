import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
    isPrivateSpaceUnlocked: boolean;
    pinModalOpen: boolean;

    // Breadcrumb navigation for nested notebooks
    currentNotebookPath: string[]; // Array of notebook IDs from root to current

    toggleSidebar: () => void;
    toggleNotebookExpand: (id: string, forceState?: boolean) => void;
    selectNote: (noteId: string | null, notebookId?: string | null, isTrash?: boolean) => void;
    unlockPrivateSpace: () => void;
    lockPrivateSpace: () => void;

    // Breadcrumb navigation
    navigateIntoNotebook: (notebookId: string) => void;
    navigateToPathIndex: (index: number) => void;
    navigateToRoot: () => void;

    toggleDarkMode: () => void;
    setDarkMode: (dark: boolean) => void;
    setThemeColor: (color: ThemeColor) => void;
    setSettingsOpen: (open: boolean) => void;
    setPinModalOpen: (open: boolean) => void;
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
                isPrivateSpaceUnlocked: false, // Always lock on load/refresh
                expandedNotebooks: new Set(state.expandedNotebooks || []),
                currentNotebookPath: state.currentNotebookPath || [],
            },
        };
    },
    setItem: (name: string, value: any) => {
        const serializedState = {
            ...value.state,
            isPrivateSpaceUnlocked: false, // Don't persist unlocked state
            expandedNotebooks: Array.from(value.state.expandedNotebooks),
            currentNotebookPath: value.state.currentNotebookPath || [],
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
            themeColor: 'yellow',
            settingsOpen: false,
            pinModalOpen: false,
            isPrivateSpaceUnlocked: false,
            currentNotebookPath: [],

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

            unlockPrivateSpace: () => set({ isPrivateSpaceUnlocked: true }),
            lockPrivateSpace: () => set({
                isPrivateSpaceUnlocked: false,
                // Optionally clear selected note if we want to force navigation out, 
                // but MainView will handle hiding the content anyway.
            }),

            // Navigate into a notebook (push to path)
            navigateIntoNotebook: (notebookId) => set((state) => ({
                currentNotebookPath: [...state.currentNotebookPath, notebookId],
                selectedNoteId: null, // Clear note selection when navigating
                selectedNotebookId: null,
            })),

            // Navigate to a specific index in the path (for breadcrumb clicks)
            navigateToPathIndex: (index) => set((state) => ({
                currentNotebookPath: state.currentNotebookPath.slice(0, index + 1),
                selectedNoteId: null,
                selectedNotebookId: null,
            })),

            // Navigate back to root
            navigateToRoot: () => set({
                currentNotebookPath: [],
                selectedNoteId: null,
                selectedNotebookId: null,
            }),

            toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
            setDarkMode: (dark) => set({ darkMode: dark }),
            setThemeColor: (color) => set({ themeColor: color }),
            setSettingsOpen: (open) => set({ settingsOpen: open }),
            setPinModalOpen: (open) => set({ pinModalOpen: open }),
        }),
        {
            name: 'leo-ui-storage',
            storage: storage,
        }
    )
);
