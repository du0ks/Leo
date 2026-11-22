import { useRef, type RefObject } from 'react';
import clsx from 'clsx';
import {
    useUIStore,
    clampSidebarWidth,
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MAX_WIDTH,
    SIDEBAR_MIN_WIDTH,
} from '../../stores/uiStore';

const KEY_STEP = 16;

/**
 * Drag handle on the sidebar's right edge (desktop only).
 *
 * While dragging it only updates the `--sidebar-w` CSS variable on the
 * container — no React re-render, so the editor never stutters — and commits
 * the final width to the store (persisted) on release.
 * Keyboard: ←/→ resize, Home/End jump to the bounds. Double-click resets.
 */
export function SidebarResizer({
    containerRef,
    onResizingChange,
}: {
    containerRef: RefObject<HTMLElement | null>;
    onResizingChange: (resizing: boolean) => void;
}) {
    const width = useUIStore((s) => s.sidebarWidth);
    const setWidth = useUIStore((s) => s.setSidebarWidth);
    const drag = useRef<{ startX: number; startWidth: number; current: number } | null>(null);
    const frame = useRef<number | null>(null);

    const apply = (w: number) => containerRef.current?.style.setProperty('--sidebar-w', `${w}px`);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startWidth: width, current: width };
        onResizingChange(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d) return;
        d.current = clampSidebarWidth(d.startWidth + e.clientX - d.startX);
        if (frame.current === null) {
            frame.current = requestAnimationFrame(() => {
                frame.current = null;
                if (drag.current) apply(drag.current.current);
            });
        }
    };

    const endDrag = () => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        apply(d.current);
        setWidth(d.current);
        onResizingChange(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const next =
            e.key === 'ArrowLeft' ? width - KEY_STEP
            : e.key === 'ArrowRight' ? width + KEY_STEP
            : e.key === 'Home' ? SIDEBAR_MIN_WIDTH
            : e.key === 'End' ? SIDEBAR_MAX_WIDTH
            : null;
        if (next === null) return;
        e.preventDefault();
        setWidth(next);
    };

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={width}
            tabIndex={0}
            title="Drag to resize · double-click to reset"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onDoubleClick={() => setWidth(SIDEBAR_DEFAULT_WIDTH)}
            onKeyDown={onKeyDown}
            // Sits on the sidebar's right edge; --sidebar-w lives on the shared container
            style={{ left: 'calc(var(--sidebar-w) - 4px)' }}
            className={clsx('group absolute inset-y-0 z-30 hidden w-2 cursor-col-resize touch-none outline-none lg:block')}
        >
            {/* Visible line: appears on hover / focus / drag */}
            <div className="mx-auto h-full w-0.5 bg-transparent transition-colors duration-150 group-hover:bg-app-primary/60 group-focus-visible:bg-app-primary group-active:bg-app-primary" />
        </div>
    );
}
