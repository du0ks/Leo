/**
 * Family Drawer — adapted from Rare UI (https://rareui.com) by Swami Malode.
 * Copyright (c) 2026 Swami Malode. MIT + Commons Clause + Attribution — see ./LICENSE.
 *
 * Leo changes: generic shell (callers supply the views), themed with Leo's CSS
 * tokens, safe-area aware, accessible title, reduced-motion support.
 */
import { useMemo, useRef, type ReactNode } from 'react';
import { Drawer } from 'vaul';
import useMeasure from 'react-use-measure';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import clsx from 'clsx';
import { X } from 'lucide-react';

export function FamilyDrawer({
    open,
    onOpenChange,
    viewKey,
    title,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Changing this animates between views (height morph + crossfade). */
    viewKey: string;
    /** Accessible name of the drawer (screen readers). */
    title: string;
    children: ReactNode;
}) {
    const reduced = useReducedMotion() ?? false;
    const [elementRef, bounds] = useMeasure();
    const previousHeightRef = useRef<number | null>(null);

    // Bigger height jumps get a slightly longer crossfade
    const opacityDuration = useMemo(() => {
        const MIN_DURATION = 0.15;
        const MAX_DURATION = 0.27;
        if (!previousHeightRef.current) {
            previousHeightRef.current = bounds.height;
            return MIN_DURATION;
        }
        const diff = Math.abs(bounds.height - previousHeightRef.current);
        previousHeightRef.current = bounds.height;
        return Math.min(Math.max(diff / 500, MIN_DURATION), MAX_DURATION);
    }, [bounds.height]);

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" />
                <Drawer.Content
                    asChild
                    aria-describedby={undefined}
                    className="fixed inset-x-3 z-[60] mx-auto max-w-[400px] overflow-hidden rounded-[32px] bg-app-surface text-app-text border border-app-border shadow-2xl outline-none"
                    style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
                >
                    <motion.div
                        animate={{ height: bounds.height || 'auto' }}
                        transition={reduced ? { duration: 0 } : { duration: 0.3, ease: [0.26, 0.08, 0.25, 1] }}
                    >
                        <Drawer.Title className="sr-only">{title}</Drawer.Title>
                        <Drawer.Close asChild>
                            <button
                                data-vaul-no-drag=""
                                aria-label="Close"
                                className="absolute top-6 right-6 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-app-bg text-app-muted transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-app-primary/60 active:scale-75"
                            >
                                <X size={16} strokeWidth={2.5} />
                            </button>
                        </Drawer.Close>
                        <AnimatePresence mode="popLayout" initial={false}>
                            <motion.div
                                key={viewKey}
                                ref={elementRef}
                                transition={reduced ? { duration: 0 } : { duration: opacityDuration, ease: [0.26, 0.08, 0.25, 1] }}
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                className="px-5 pt-2.5 pb-6 antialiased"
                            >
                                {/* Drag handle */}
                                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-app-border" aria-hidden />
                                {children}
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

export function DrawerHeader({
    icon,
    title,
    description,
}: {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
}) {
    return (
        <header className="mt-3 mb-5 pr-10">
            {icon && <div className="text-app-primary">{icon}</div>}
            <h2 className="mt-2.5 text-[20px] font-semibold leading-tight text-app-text break-words">{title}</h2>
            {description && <p className="mt-2 text-[15px] leading-[22px] text-app-muted">{description}</p>}
        </header>
    );
}

/** Full-width list button (an action row). */
export function DrawerButton({
    children,
    onClick,
    disabled,
    destructive,
    className,
}: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    destructive?: boolean;
    className?: string;
}) {
    return (
        <button
            type="button"
            data-vaul-no-drag=""
            disabled={disabled}
            onClick={onClick}
            className={clsx(
                'flex h-12 w-full items-center gap-3.5 rounded-2xl px-4 text-[16px] font-medium transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-app-primary/60 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100',
                destructive ? 'bg-red-500/10 text-red-500' : 'bg-app-bg text-app-text',
                className
            )}
        >
            {children}
        </button>
    );
}

/** Pill button used in pairs (Cancel / Confirm). */
export function DrawerPillButton({
    children,
    onClick,
    variant = 'secondary',
    disabled,
    type = 'button',
}: {
    children: ReactNode;
    onClick?: () => void;
    variant?: 'secondary' | 'primary' | 'destructive';
    disabled?: boolean;
    type?: 'button' | 'submit';
}) {
    return (
        <button
            type={type}
            data-vaul-no-drag=""
            disabled={disabled}
            onClick={onClick}
            className={clsx(
                'flex h-12 w-full items-center justify-center gap-2 rounded-full text-[16px] font-semibold transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-app-primary/60 active:scale-95 disabled:opacity-50',
                variant === 'secondary' && 'bg-app-bg text-app-text',
                variant === 'primary' && 'bg-app-primary text-white',
                variant === 'destructive' && 'bg-red-500 text-white'
            )}
        >
            {children}
        </button>
    );
}
