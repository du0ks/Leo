import { useSyncExternalStore } from 'react';

/** Live result of a CSS media query (e.g. '(max-width: 1023px)'). */
export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const mql = window.matchMedia(query);
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        },
        () => window.matchMedia(query).matches,
        () => false
    );
}

/** Matches Tailwind's `lg` breakpoint used throughout the layout. */
export const MOBILE_QUERY = '(max-width: 1023px)';
