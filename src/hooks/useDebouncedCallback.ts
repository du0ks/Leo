import { useRef, useCallback, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

type DebouncedFunction<T extends AnyFunction> = ((...args: Parameters<T>) => void) & {
    flush: () => Promise<void>;
    cancel: () => void;
    hasPending: () => boolean;
};

export function useDebouncedCallback<T extends AnyFunction>(
    callback: T,
    delay: number
): DebouncedFunction<T> {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callbackRef = useRef<T>(callback);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingArgsRef = useRef<any[] | null>(null);
    // Track in-flight async operations
    const inflightPromiseRef = useRef<Promise<void> | null>(null);

    // Update ref when callback changes
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    // Cleanup on unmount - flush pending changes instead of dropping them
    useEffect(() => {
        return () => {
            if (timeoutRef.current && pendingArgsRef.current) {
                clearTimeout(timeoutRef.current);
                // Save pending changes on unmount
                callbackRef.current(...pendingArgsRef.current);
            }
        };
    }, []);

    // Create stable flush and cancel functions using refs
    const flushRef = useRef<() => Promise<void>>(async () => { });
    const cancelRef = useRef<() => void>(() => { });
    const hasPendingRef = useRef<() => boolean>(() => false);

    // Update the flush/cancel functions on every render to capture current refs
    flushRef.current = async () => {
        // First, wait for any in-flight operation from a previous flush
        if (inflightPromiseRef.current) {
            await inflightPromiseRef.current;
        }

        if (timeoutRef.current && pendingArgsRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
            const args = pendingArgsRef.current;
            pendingArgsRef.current = null;

            // Execute and track the promise
            const result = callbackRef.current(...args);
            if (result && typeof result.then === 'function') {
                inflightPromiseRef.current = result;
                try {
                    await result;
                } finally {
                    inflightPromiseRef.current = null;
                }
            }
        }
    };

    cancelRef.current = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
            pendingArgsRef.current = null;
        }
    };

    hasPendingRef.current = () => {
        return pendingArgsRef.current !== null || inflightPromiseRef.current !== null;
    };

    const debouncedCallback = useCallback(
        (...args: Parameters<T>) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            // Store args for potential flush
            pendingArgsRef.current = args;

            timeoutRef.current = setTimeout(() => {
                const result = callbackRef.current(...args);
                // Track if result is a promise
                if (result && typeof result.then === 'function') {
                    inflightPromiseRef.current = result;
                    result.finally(() => {
                        inflightPromiseRef.current = null;
                    });
                }
                pendingArgsRef.current = null;
                timeoutRef.current = null;
            }, delay);
        },
        [delay]
    ) as DebouncedFunction<T>;

    // Expose stable wrapper functions that delegate to current refs
    debouncedCallback.flush = useCallback(async () => {
        await flushRef.current();
    }, []);

    debouncedCallback.cancel = useCallback(() => {
        cancelRef.current();
    }, []);

    debouncedCallback.hasPending = useCallback(() => {
        return hasPendingRef.current();
    }, []);

    return debouncedCallback;
}
