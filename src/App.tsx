import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';

import { useAuth } from './hooks/useAuth';
import { useUIStore } from './stores/uiStore';
import { LoginForm } from './components/auth/LoginForm';
import { Sidebar } from './components/layout/Sidebar';
import { NoteList } from './components/layout/NoteList';
import { MainView } from './components/layout/MainView';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { LogOut, Menu, Loader2 } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const { darkMode, sidebarOpen, toggleSidebar } = useUIStore();

  // Apply dark mode class to html
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-bg">
        <Loader2 className="w-8 h-8 animate-spin text-dark-muted" />
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <LoginForm />;
  }

  // Main app layout
  return (
    <div className="h-screen flex flex-col bg-dark-bg text-dark-text overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-surface/50">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-dark-border transition-colors lg:hidden"
          >
            <Menu className="w-5 h-5 text-dark-muted" />
          </button>
          <h1 className="text-xl font-bold">Leo</h1>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={signOut}
            className="p-2 rounded-lg hover:bg-dark-border transition-colors"
            title="Sign out"
          >
            <LogOut className="w-5 h-5 text-dark-muted" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div
          className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } lg:translate-x-0 fixed lg:relative z-20 transition-transform duration-200`}
        >
          <Sidebar />
        </div>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-10 lg:hidden"
            onClick={toggleSidebar}
          />
        )}

        {/* Note List */}
        <NoteList />

        {/* Main View */}
        <MainView />
      </div>
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
