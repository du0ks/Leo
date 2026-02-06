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

    // Flush: immediately execute pending callback
    debouncedCallback.flush = useCallback(() => {
        if (timeoutRef.current && pendingArgsRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
            callbackRef.current(...pendingArgsRef.current);
            pendingArgsRef.current = null;
        }
    }, []);

    // Cancel: discard pending callback without executing
    debouncedCallback.cancel = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
            pendingArgsRef.current = null;
        }
    }, []);

    return debouncedCallback;
}
