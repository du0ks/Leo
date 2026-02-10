import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export function UpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
            // Check for updates every 60 seconds
            if (registration) {
                setInterval(() => {
                    registration.update();
                }, 60 * 1000);
            }
        },
        onRegisterError(error: Error) {
            console.error('SW registration error:', error);
        },
    });

    if (!needRefresh) return null;

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-slide-up">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-app-surface/95 backdrop-blur-md border border-app-primary/30 shadow-lg shadow-black/20">
                <div className="flex items-center gap-2 text-sm text-app-text">
                    <RefreshCw className="w-4 h-4 text-app-primary" />
                    <span>New version available</span>
                </div>
                <button
                    onClick={() => updateServiceWorker(true)}
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
