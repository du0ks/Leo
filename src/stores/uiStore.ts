import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Desktop sidebar width bounds (px). */
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 400;
export const SIDEBAR_DEFAULT_WIDTH = 256;
export const clampSidebarWidth = (w: number) =>
    Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w)));

export type ThemeColor = 'blue' | 'red' | 'yellow' | 'green' | 'grey' | 'black' | 'purple' | 'pink';

interface UIState {
    sidebarOpen: boolean;
    /** Desktop (lg+) sidebar width in px; mobile always uses the overlay width. */
    sidebarWidth: number;
    setSidebarWidth: (width: number) => void;
    expandedNotebooks: Set<string>; // IDs of expanded notebooks
    selectedNoteId: string | null;
    selectedNotebookId: string | null; // Needed for Firebase subcollection queries
    isTrashView: boolean;
    darkMode: boolean;
    themeColor: ThemeColor;
    settingsOpen: boolean;
    /** Note whose title input is focused (sidebar keeps its order stable meanwhile). */
    titleFocusedNoteId: string | null;

    // Breadcrumb navigation for nested notebooks
    currentNotebookPath: string[]; // Array of notebook IDs from root to current

    toggleSidebar: () => void;
    toggleNotebookExpand: (id: string, forceState?: boolean) => void;
    selectNote: (noteId: string | null, notebookId?: string | null, isTrash?: boolean) => void;

    // Breadcrumb navigation
    navigateIntoNotebook: (notebookId: string) => void;
    navigateToPathIndex: (index: number) => void;
    navigateToRoot: () => void;

    toggleDarkMode: () => void;
    setDarkMode: (dark: boolean) => void;
    setThemeColor: (color: ThemeColor) => void;
    setSettingsOpen: (open: boolean) => void;
    setTitleFocusedNoteId: (id: string | null) => void;
    /** Clear per-user navigation state (on sign-out). Keeps theme preferences. */
    resetSession: () => void;
}

// Custom storage wrapper to handle Set serialization
const storage = {
    getItem: (name: string) => {
        let state;
        try {
            const str = localStorage.getItem(name);
            if (!str) return null;
            state = JSON.parse(str).state;
            if (!state || typeof state !== 'object') return null;
        } catch {
            return null; // Corrupt or inaccessible storage: fall back to defaults
        }
        return {
            state: {
                ...state,
                expandedNotebooks: new Set(state.expandedNotebooks || []),
                currentNotebookPath: state.currentNotebookPath || [],
                sidebarWidth: clampSidebarWidth(Number(state.sidebarWidth) || SIDEBAR_DEFAULT_WIDTH),
            },
        };
    },
    setItem: (name: string, value: any) => {
        const { settingsOpen: _settingsOpen, titleFocusedNoteId: _titleFocused, ...persisted } = value.state;
        const serializedState = {
            ...persisted,
            expandedNotebooks: Array.from(value.state.expandedNotebooks),
            currentNotebookPath: value.state.currentNotebookPath || [],
        };
        try {
            localStorage.setItem(name, JSON.stringify({ state: serializedState }));
        } catch {
            // Storage full or blocked (private mode) — UI state just won't persist
        }
    },
    removeItem: (name: string) => {
        try {
            localStorage.removeItem(name);
        } catch {
            // ignore
        }
    },
};

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            sidebarOpen: true,
            sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
            setSidebarWidth: (width) => set({ sidebarWidth: clampSidebarWidth(width) }),
            expandedNotebooks: new Set(),
            selectedNoteId: null,
            selectedNotebookId: null,
            isTrashView: false,
            darkMode: true,
            themeColor: 'yellow',
            settingsOpen: false,
            titleFocusedNoteId: null,
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
            setTitleFocusedNoteId: (id) => set({ titleFocusedNoteId: id }),
            resetSession: () => set({
                expandedNotebooks: new Set(),
                selectedNoteId: null,
                selectedNotebookId: null,
                isTrashView: false,
                settingsOpen: false,
                currentNotebookPath: [],
            }),
        }),
        {
            name: 'leo-ui-storage',
            storage: storage,
        }
    )
);
