/**
 * Global registry for pending (debounced) editor saves.
 *
 * Components that buffer edits (e.g. MainView) register a flusher here so that
 * other parts of the app can force those edits to be written before doing
 * something destructive — moving a note, signing out, or the page unloading.
 *
 * Flushing only *issues* the Firestore writes. With offline persistence enabled
 * Firestore applies them to the local cache immediately and syncs them later,
 * so flushing never blocks on the network.
 */
type Flusher = () => void;

const flushers = new Set<Flusher>();

export function registerFlusher(fn: Flusher): () => void {
    flushers.add(fn);
    return () => {
        flushers.delete(fn);
    };
}

export function flushPendingSaves(): void {
    flushers.forEach((fn) => {
        try {
            fn();
        } catch (err) {
            console.error('Failed to flush pending save:', err);
        }
    });
}
