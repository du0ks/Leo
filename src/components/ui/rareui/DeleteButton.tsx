/**
 * Delete Button — adapted from Rare UI (https://rareui.com) by Swami Malode.
 * Copyright (c) 2026 Swami Malode. MIT + Commons Clause + Attribution — see ./LICENSE.
 *
 * Leo changes: themed with Leo's CSS tokens, `sm`/`md` sizes, custom labels,
 * `onOpenChange`, and events don't bubble into parent rows (click / drag).
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
    AnimatePresence,
    LazyMotion,
    domAnimation,
    m as motion,
    useReducedMotion,
    type Transition,
} from 'motion/react';
import clsx from 'clsx';

const HINGE = '3px 6px';
const LID_OPEN = -35;
const WALL_TOP = 6;
const WALL_TOP_OPEN = 13.5;
const WALL_BASE = 20;

/** Bin body path; walls get shorter as the lid lifts. Same shape both ways so `d` can morph. */
const binPath = (top: number) => `M19 ${top}v${WALL_BASE - top}a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V${top}`;

const HOLD = { deleted: 1400, kept: 600 };

const EASE = [0.32, 0.72, 0, 1] as const;
const EASE_LID = [0.34, 1.1, 0.64, 1] as const;

const WIDTH = { duration: 0.62, ease: EASE } as const;
const LID = { duration: 0.6, ease: EASE_LID } as const;
const WALL = { duration: 0.56, ease: EASE } as const;
const IN = { duration: 0.44, ease: EASE, delay: 0.14 } as const;
const OUT = { duration: 0.3, ease: EASE } as const;
const TAP = { duration: 0.2, ease: EASE } as const;
const SWAP = { duration: 0.22, ease: EASE } as const;
const SETTLE = { duration: 0.45, ease: EASE } as const;
const PRESS = { type: 'spring', stiffness: 520, damping: 18, mass: 0.5 } as const;
const INSTANT = { duration: 0 } as const;

const ACCENT = '#ef4444'; // Leo's destructive red

const SIZES = {
    // Compact, for dense sidebar rows
    sm: { tile: 28, panel: 60, radius: 'rounded-lg', icon: 14, circle: 'h-[22px] w-[22px]', circleIcon: 11, gap: 'gap-1.5' },
    // Header / toolbar
    md: { tile: 40, panel: 80, radius: 'rounded-xl', icon: 18, circle: 'h-7 w-7', circleIcon: 13, gap: 'gap-2' },
} as const;

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-app-primary/60';
const LIFT =
    'shadow-[0_0.5px_1px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-[0_0.5px_1px_rgba(0,0,0,0.35),0_1.5px_4px_rgba(0,0,0,0.25)]';

const ICON = {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
} as const;

const panelMotion = {
    hidden: { opacity: 0, x: -6, transition: OUT },
    shown: { opacity: 1, x: 0, transition: { ...IN, staggerChildren: 0.07 } },
};

const circleMotion = {
    hidden: { opacity: 0, scale: 0.9, transition: OUT },
    shown: { opacity: 1, scale: 1, transition: IN },
};

function Circle({
    label,
    onClick,
    size,
    children,
}: {
    label: string;
    onClick: () => void;
    size: keyof typeof SIZES;
    children: ReactNode;
}) {
    const reduced = useReducedMotion() ?? false;
    const s = SIZES[size];

    return (
        <motion.div className="flex" variants={reduced ? undefined : circleMotion}>
            <motion.button
                type="button"
                aria-label={label}
                title={label}
                onClick={onClick}
                whileHover={reduced ? undefined : { scale: 1.06 }}
                whileTap={reduced ? undefined : { scale: 0.84 }}
                transition={PRESS}
                className={clsx(
                    'grid place-items-center rounded-full bg-app-surface text-app-muted transition-colors duration-200 hover:text-app-text',
                    s.circle,
                    FOCUS,
                    LIFT
                )}
            >
                <svg {...ICON} width={s.circleIcon} height={s.circleIcon} stroke="currentColor" strokeWidth="3.5">
                    {children}
                </svg>
            </motion.button>
        </motion.div>
    );
}

type Status = 'idle' | 'deleted' | 'kept';

export type DeleteButtonProps = {
    onConfirm?: () => void;
    onCancel?: () => void;
    onOpenChange?: (open: boolean) => void;
    /** Accessible label / tooltip of the trigger, e.g. "Move to trash". */
    label?: string;
    confirmLabel?: string;
    size?: keyof typeof SIZES;
    /** Classes for the idle (closed) tile, e.g. colors. */
    className?: string;
};

export function DeleteButton({
    onConfirm,
    onCancel,
    onOpenChange,
    label = 'Delete',
    confirmLabel = 'Confirm delete',
    size = 'md',
    className,
}: DeleteButtonProps) {
    const reduced = useReducedMotion() ?? false;
    const [open, setOpenState] = useState(false);
    const [status, setStatus] = useState<Status>('idle');
    const trigger = useRef<HTMLButtonElement>(null);
    const timing = (transition: Transition) => (reduced ? INSTANT : transition);
    const s = SIZES[size];

    const onOpenChangeRef = useRef(onOpenChange);
    onOpenChangeRef.current = onOpenChange;
    const setOpen = (next: boolean) => {
        setOpenState(next);
        onOpenChangeRef.current?.(next);
    };

    useEffect(() => {
        if (status === 'idle') return;
        const done = setTimeout(() => setStatus('idle'), HOLD[status]);
        return () => clearTimeout(done);
    }, [status]);

    // Close when clicking anywhere else
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (root.current && !root.current.contains(e.target as Node)) resolve('kept', false);
        };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const resolve = (next: Exclude<Status, 'idle'>, refocus = true) => {
        setOpen(false);
        setStatus(next);
        if (refocus) trigger.current?.focus();
        (next === 'deleted' ? onConfirm : onCancel)?.();
    };

    return (
        <LazyMotion features={domAnimation}>
        <motion.div
            ref={root}
            data-slot="delete-button"
            data-state={open ? 'open' : 'closed'}
            data-status={status}
            className={clsx(
                'relative shrink-0',
                s.radius,
                open ? 'bg-app-surface text-app-muted' : className ?? 'text-app-muted hover:text-red-500 hover:bg-red-500/10'
            )}
            style={{ height: s.tile }}
            initial={false}
            animate={{ width: open ? s.tile + s.panel : s.tile }}
            transition={timing(WIDTH)}
            // Keep clicks/drags from reaching the parent row (expand toggle, dnd-kit)
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape' && open) resolve('kept');
            }}
        >
            <motion.button
                ref={trigger}
                type="button"
                aria-label={label}
                title={open ? 'Cancel' : label}
                aria-expanded={open}
                onClick={() => {
                    if (open) return resolve('kept');
                    setStatus('idle');
                    setOpen(true);
                }}
                whileTap={reduced ? undefined : { scale: 0.94 }}
                transition={TAP}
                className={clsx('relative z-10 grid place-items-center', s.radius, FOCUS)}
                style={{ width: s.tile, height: s.tile }}
            >
                <AnimatePresence mode="wait" initial={false}>
                    {status === 'deleted' ? (
                        <motion.svg
                            key="done"
                            {...ICON}
                            width={s.icon}
                            height={s.icon}
                            stroke={ACCENT}
                            strokeWidth="2.5"
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={timing(SWAP)}
                        >
                            <motion.path
                                d="M4 12.5 9.5 18 20 7"
                                initial={reduced ? undefined : { pathLength: 0 }}
                                animate={reduced ? undefined : { pathLength: 1 }}
                                transition={SETTLE}
                            />
                        </motion.svg>
                    ) : (
                        <motion.svg
                            key="bin"
                            {...ICON}
                            width={s.icon}
                            height={s.icon}
                            stroke="currentColor"
                            strokeWidth="2"
                            className="overflow-visible"
                            initial={{ opacity: 0 }}
                            // "Kept": a small settle nudge
                            animate={{ opacity: 1, scale: status === 'kept' && !reduced ? [1, 0.86, 1] : 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ opacity: timing(SWAP), scale: SETTLE }}
                        >
                            <motion.path
                                initial={false}
                                animate={{ d: binPath(open ? WALL_TOP_OPEN : WALL_TOP) }}
                                transition={timing(WALL)}
                            />
                            <motion.g
                                style={{ transformBox: 'view-box', transformOrigin: HINGE }}
                                animate={{ rotate: open ? LID_OPEN : 0 }}
                                transition={timing(LID)}
                            >
                                <path d="M3 6h18" />
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </motion.g>
                        </motion.svg>
                    )}
                </AnimatePresence>
            </motion.button>

            <span role="status" aria-live="polite" className="sr-only">
                {status === 'deleted' ? 'Deleted' : status === 'kept' ? 'Kept' : ''}
            </span>

            <AnimatePresence>
                {open && (
                    <motion.div
                        key="panel"
                        style={{ width: s.panel }}
                        className={clsx(
                            'absolute inset-y-0 right-0 flex items-center justify-center bg-app-bg border border-app-border',
                            s.radius,
                            s.gap
                        )}
                        variants={reduced ? undefined : panelMotion}
                        initial="hidden"
                        animate="shown"
                        exit="hidden"
                    >
                        <Circle size={size} label={confirmLabel} onClick={() => resolve('deleted')}>
                            <path d="M4 12.5 9.5 18 20 7" stroke={ACCENT} />
                        </Circle>
                        <Circle size={size} label="Cancel" onClick={() => resolve('kept')}>
                            <path d="M6 6 18 18M18 6 6 18" />
                        </Circle>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
        </LazyMotion>
    );
}

export default DeleteButton;
