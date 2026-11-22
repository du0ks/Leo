import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';
import { RefreshCw, X } from 'lucide-react';

export function UpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisterError(error: Error) {
            console.error('SW registration error:', error);
        },
    });

    // The reload after the new SW takes control is handled globally by the
    // `controllerchange` listener in main.tsx.

    // Check for SW updates when user returns to the tab (visibility change).
    // Zero bandwidth while idle, checks only when user actually comes back.
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                const registration = await navigator.serviceWorker?.getRegistration();
                if (registration) {
                    registration.update();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    if (!needRefresh) return null;

    const handleUpdate = () => {
        // Pass false to NOT auto-reload — we handle reload ourselves
        // via the global controllerchange listener in main.tsx.
        updateServiceWorker(false);
    };

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-slide-up">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-app-surface/95 backdrop-blur-md border border-app-primary/30 shadow-lg shadow-black/20">
                <div className="flex items-center gap-2 text-sm text-app-text">
                    <RefreshCw className="w-4 h-4 text-app-primary" />
                    <span>New version available</span>
                </div>
                <button
                    onClick={handleUpdate}
                    className="px-3 py-1 text-xs font-semibold rounded-lg bg-app-primary text-white hover:opacity-90 transition-opacity"
                >
                    Update
                </button>
                <button
                    onClick={() => setNeedRefresh(false)}
                    className="p-1 rounded-md hover:bg-white/10 transition-colors text-app-text-secondary"
                    title="Dismiss"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
