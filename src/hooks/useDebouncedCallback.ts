import { useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';

export type DebouncedFunction<A extends unknown[]> = ((...args: A) => void) & {
    /** Run the pending call (if any) immediately. Synchronous. */
    flush: () => void;
    /** Drop the pending call (if any). */
    cancel: () => void;
    /** Whether a call is waiting for the debounce timer. */
    hasPending: () => boolean;
};

/**
 * Debounce a callback. The returned function and its helpers are stable for the
 * component's lifetime (as long as `delay` does not change). Pending calls are
 * flushed on unmount so buffered edits are never silently dropped.
 */
export function useDebouncedCallback<A extends unknown[]>(
    callback: (...args: A) => void,
    delay: number
): DebouncedFunction<A> {
    const callbackRef = useRef(callback);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingArgsRef = useRef<A | null>(null);

    useLayoutEffect(() => {
        callbackRef.current = callback;
    });

    const flush = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        const args = pendingArgsRef.current;
        pendingArgsRef.current = null;
        if (args) callbackRef.current(...args);
    }, []);

    const cancel = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        pendingArgsRef.current = null;
    }, []);

    const hasPending = useCallback(() => pendingArgsRef.current !== null, []);

    const debounced = useCallback(
        (...args: A) => {
            pendingArgsRef.current = args;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(flush, delay);
        },
        [delay, flush]
    );

    // Save pending changes on unmount instead of dropping them
    useEffect(() => flush, [flush]);

    return useMemo(
        () => Object.assign(debounced, { flush, cancel, hasPending }),
        [debounced, flush, cancel, hasPending]
    );
}
