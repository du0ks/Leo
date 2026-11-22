import { lazy, Suspense } from 'react';
import { Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { DeleteButtonProps } from './DeleteButton';

// The animated button pulls in `motion`; keep it out of the initial bundle.
const DeleteButtonImpl = lazy(() => import('./DeleteButton'));

const TILE = { sm: 28, md: 40 } as const;

/** Lazy `DeleteButton` with a same-size static placeholder while it loads. */
export function DeleteButton(props: DeleteButtonProps) {
    const size = props.size ?? 'md';
    const fallback = (
        <div
            aria-hidden
            className={clsx(
                'grid shrink-0 place-items-center',
                size === 'sm' ? 'rounded-lg' : 'rounded-xl',
                props.className ?? 'text-app-muted'
            )}
            style={{ width: TILE[size], height: TILE[size] }}
        >
            <Trash2 size={size === 'sm' ? 14 : 18} />
        </div>
    );
    return (
        <Suspense fallback={fallback}>
            <DeleteButtonImpl {...props} />
        </Suspense>
    );
}
