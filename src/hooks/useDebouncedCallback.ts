import { useRef, useCallback, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => void;

type DebouncedFunction<T extends AnyFunction> = T & {
    flush: () => void;
    cancel: () => void;
};

export function useDebouncedCallback<T extends AnyFunction>(
    callback: T,
    delay: number
): DebouncedFunction<T> {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const callbackRef = useRef<T>(callback);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingArgsRef = useRef<any[] | null>(null);

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
    // These are NOT wrapped in useCallback to avoid stale closure issues
    const flushRef = useRef<() => void>(() => { });
    const cancelRef = useRef<() => void>(() => { });

    // Update the flush/cancel functions on every render to capture current refs
    flushRef.current = () => {
        if (timeoutRef.current && pendingArgsRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
            callbackRef.current(...pendingArgsRef.current);
            pendingArgsRef.current = null;
        }
    };

    cancelRef.current = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
            pendingArgsRef.current = null;
        }
    };

    const debouncedCallback = useCallback(
        (...args: Parameters<T>) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            // Store args for potential flush
            pendingArgsRef.current = args;

            timeoutRef.current = setTimeout(() => {
                callbackRef.current(...args);
                pendingArgsRef.current = null;
                timeoutRef.current = null;
            }, delay);
        },
        [delay]
    ) as DebouncedFunction<T>;

    // Expose stable wrapper functions that delegate to current refs
    // This avoids stale closures - flush always operates on current pending state
    debouncedCallback.flush = useCallback(() => {
        flushRef.current();
    }, []);

    debouncedCallback.cancel = useCallback(() => {
        cancelRef.current();
    }, []);

    return debouncedCallback;
}
