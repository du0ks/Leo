import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';

import { useAuth } from './hooks/useAuth';
import { useUIStore } from './stores/uiStore';
import { useUserSettings } from './hooks/useUserSettings';
import { LoginForm } from './components/auth/LoginForm';
import { Sidebar } from './components/layout/Sidebar';
import { MainView } from './components/layout/MainView';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { SettingsModal } from './components/settings/SettingsModal';
import { LogOut, Menu, Loader2, Settings } from 'lucide-react';
import clsx from 'clsx';
import { UpdatePrompt } from './components/ui/UpdatePrompt';
import { SidebarResizer } from './components/layout/SidebarResizer';

// Deliver cache updates in a microtask instead of the default setTimeout(0), so
// optimistic updates render in the same frame as the UI change that caused them
// (e.g. a dropped row doesn't flash back into its old place for a frame).
notifyManager.setScheduler((cb) => queueMicrotask(cb));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      // Firestore has its own offline cache; let it answer while offline
      networkMode: 'always',
    },
    mutations: {
      // Otherwise React Query pauses mutations offline and the writes never
      // reach Firestore's offline queue (lost on reload).
      networkMode: 'always',
    },
  },
});

function AppContent() {
  const { loading, signOut, isAuthenticated } = useAuth();
  const darkMode = useUIStore((s) => s.darkMode);
  const themeColor = useUIStore((s) => s.themeColor);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const layoutRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  // Trigger background settings sync (never blocks - uses cached Zustand values)
  useUserSettings();

  // Apply theme classes and attributes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    root.style.colorScheme = darkMode ? 'dark' : 'light';
    root.setAttribute('data-theme', themeColor);
  }, [darkMode, themeColor]);

  // Only show initial auth loading spinner
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-app-bg text-app-text">
        <Loader2 className="w-8 h-8 animate-spin text-app-primary" />
      </div>
    );
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return <LoginForm />;
  }

  // No more settings loading spinner - go straight to main UI!

  return (
    <div className="h-screen flex flex-col bg-app-bg text-app-text overflow-hidden transition-colors duration-300">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 app-header-vibrant shadow-sm z-30 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="app-header-vibrant-button"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 ml-2">
            <img src="/leo.png" alt="Leo Logo" className="w-7 h-7 object-contain rounded-lg" />
            <h1 className="text-xl font-bold tracking-tight">Leo</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="app-header-vibrant-button group"
            title="Settings"
          >
            <Settings className="w-5 h-5 transition-transform group-hover:rotate-45" />
          </button>
          <button
            onClick={signOut}
            className="app-header-vibrant-button hover:!bg-red-500/20"
            title="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div
        ref={layoutRef}
        className="flex-1 flex overflow-hidden relative"
        style={{ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}
      >
        {/* Sidebar: fixed overlay width on mobile, user-resizable on desktop */}
        <aside
          className={clsx(
            "absolute inset-y-0 left-0 lg:relative z-20 shrink-0 bg-app-surface border-r border-app-border overflow-hidden",
            // No width animation while dragging, or the panel lags behind the cursor
            !resizing && "transition-all duration-300 ease-in-out",
            sidebarOpen ? "w-64 lg:w-[var(--sidebar-w)] translate-x-0" : "w-0 -translate-x-full lg:translate-x-0"
          )}
        >
          <div className="w-64 lg:w-[var(--sidebar-w)] h-full">
            <Sidebar />
          </div>
        </aside>

        {sidebarOpen && <SidebarResizer containerRef={layoutRef} onResizingChange={setResizing} />}

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-10 lg:hidden"
            onClick={toggleSidebar}
          />
        )}

        {/* Note List - REMOVED */}
        {/* <NoteList /> */}

        {/* Main View */}
        <MainView />
      </div>

      <SettingsModal />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <AppContent />
          <UpdatePrompt />
        </MantineProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
