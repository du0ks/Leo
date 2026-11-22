/**
 * Report a failed background operation to the user.
 *
 * Mutations update the UI optimistically and write to Firestore in the
 * background, so failures surface here instead of at the call site.
 */
export function notifyError(action: string, err: unknown): void {
    console.error(`${action} failed:`, err);
    const message = err instanceof Error && err.message ? err.message : 'Please try again.';
    window.alert(`${action} failed: ${message}`);
}

/** Run a write in the background; on failure resync state and tell the user. */
export function inBackground(promise: Promise<unknown>, action: string, onFail?: () => void): void {
    promise.catch((err) => {
        try {
            onFail?.();
        } finally {
            notifyError(action, err);
        }
    });
}
