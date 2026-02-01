import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

function AppContent() {
  const { loading, signOut, isAuthenticated } = useAuth();
  const {
    darkMode,
    themeColor,
    sidebarOpen,
    toggleSidebar,
    setSettingsOpen
  } = useUIStore();

  // Trigger background settings sync (never blocks - uses cached Zustand values)
  useUserSettings();

  // Apply theme classes and attributes
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
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

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <aside
          className={clsx(
            "absolute inset-y-0 left-0 lg:relative z-20 transition-all duration-300 ease-in-out bg-app-surface border-r border-app-border overflow-hidden",
            sidebarOpen ? "w-64 translate-x-0" : "w-0 -translate-x-full lg:translate-x-0"
          )}
        >
          <div className="w-64 h-full">
            <Sidebar />
          </div>
        </aside>

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
        </MantineProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
