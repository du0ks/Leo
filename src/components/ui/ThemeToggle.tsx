import { Moon, Sun } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

export function ThemeToggle() {
    const { darkMode, toggleDarkMode } = useUIStore();

    return (
        <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg hover:bg-dark-border transition-colors"
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {darkMode ? (
                <Sun className="w-5 h-5 text-dark-muted" />
            ) : (
                <Moon className="w-5 h-5 text-dark-muted" />
            )}
        </button>
    );
}
