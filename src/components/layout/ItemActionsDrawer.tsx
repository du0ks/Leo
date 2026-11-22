import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Book, Check, FilePlus, FileText, FolderInput, FolderPlus, Library, Pencil, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { FamilyDrawer, DrawerButton, DrawerHeader, DrawerPillButton } from '../ui/rareui/FamilyDrawer';
import {
    useCreateNotebook,
    useMoveNotebook,
    useSoftDeleteNotebook,
    useUpdateNotebook,
} from '../../hooks/useNotebooks';
import { useCreateNote, useMoveNote, useSoftDeleteNote, saveNoteFields } from '../../hooks/useNotes';
import { useUIStore } from '../../stores/uiStore';
import { flushPendingSaves } from '../../lib/pendingSaves';
import type { Note, Notebook } from '../../lib/types';

export type ActionTarget = { type: 'note'; note: Note } | { type: 'notebook'; notebook: Notebook };

type View = 'actions' | 'move' | 'rename' | 'subnotebook' | 'trash';

const isMobileViewport = () => window.matchMedia('(max-width: 1023px)').matches;

const errorMessage = (err: unknown) =>
    err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';

/**
 * Bottom-sheet with the actions of a note or notebook. Used on mobile, where
 * hover icons and drag-and-drop are hard to use.
 */
export function ItemActionsDrawer({
    target,
    open,
    onOpenChange,
    notebooks,
    childrenMap,
}: {
    target: ActionTarget | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    notebooks: Notebook[];
    childrenMap: Map<string, Notebook[]>;
}) {
    const [view, setView] = useState<View>('actions');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const createNote = useCreateNote();
    const createNotebook = useCreateNotebook();
    const updateNotebook = useUpdateNotebook();
    const moveNote = useMoveNote();
    const moveNotebook = useMoveNotebook();
    const softDeleteNote = useSoftDeleteNote();
    const softDeleteNotebook = useSoftDeleteNotebook();

    // Start from the action list every time the drawer opens
    useEffect(() => {
        if (open) {
            setView('actions');
            setError(null);
            setBusy(false);
        }
    }, [open, target]);

    const title = target ? (target.type === 'note' ? target.note.title || 'Untitled' : target.notebook.title) : '';

    const go = (next: View) => {
        setError(null);
        if (next === 'rename') setName(title);
        if (next === 'subnotebook') setName('');
        setView(next);
    };

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    // Notebooks in tree order, with depth, for the "Move to…" picker
    const tree = useMemo(() => {
        const roots = notebooks.filter((nb) => nb.parent_notebook_id === null);
        const out: { notebook: Notebook; depth: number }[] = [];
        const walk = (nb: Notebook, depth: number) => {
            out.push({ notebook: nb, depth });
            for (const child of childrenMap.get(nb.id) ?? []) walk(child, depth + 1);
        };
        roots.forEach((nb) => walk(nb, 0));
        return out;
    }, [notebooks, childrenMap]);

    // A notebook can't move into itself or its own sub-notebooks
    const excludedIds = useMemo(() => {
        if (target?.type !== 'notebook') return new Set<string>();
        const ids = new Set<string>([target.notebook.id]);
        const stack = [target.notebook.id];
        while (stack.length) {
            for (const child of childrenMap.get(stack.pop()!) ?? []) {
                ids.add(child.id);
                stack.push(child.id);
            }
        }
        return ids;
    }, [target, childrenMap]);

    if (!target) return null;

    // --- Actions --------------------------------------------------------------

    const handleNewNote = () =>
        run(async () => {
            if (target.type !== 'notebook') return;
            const nb = target.notebook;
            const ui = useUIStore.getState();
            ui.toggleNotebookExpand(nb.id, true);
            const note = await createNote.mutateAsync({ notebook_id: nb.id, title: 'Untitled Note', content: [] });
            ui.selectNote(note.id, nb.id);
            // On phones, jump straight into the new note
            if (isMobileViewport() && useUIStore.getState().sidebarOpen) ui.toggleSidebar();
        });

    const handleMove = (toNotebookId: string | null) =>
        run(async () => {
            if (target.type === 'note') {
                if (!toNotebookId) return;
                flushPendingSaves();
                await moveNote.mutateAsync({
                    id: target.note.id,
                    fromNotebookId: target.note.notebook_id,
                    toNotebookId,
                });
            } else {
                await moveNotebook.mutateAsync({ id: target.notebook.id, newParentId: toNotebookId });
            }
            if (toNotebookId) useUIStore.getState().toggleNotebookExpand(toNotebookId, true);
        });

    const handleNameSubmit = (e: FormEvent) => {
        e.preventDefault();
        const value = name.trim();
        if (!value) return;
        run(async () => {
            if (view === 'subnotebook' && target.type === 'notebook') {
                await createNotebook.mutateAsync({
                    user_id: target.notebook.user_id,
                    title: value,
                    parent_notebook_id: target.notebook.id,
                });
                useUIStore.getState().toggleNotebookExpand(target.notebook.id, true);
            } else if (target.type === 'notebook') {
                await updateNotebook.mutateAsync({ id: target.notebook.id, title: value });
            } else {
                // Local write is applied instantly; don't wait for the server
                saveNoteFields(target.note.notebook_id, target.note.id, { title: value }).catch((err) =>
                    console.error('Rename failed:', err)
                );
            }
        });
    };

    const handleTrash = () =>
        run(async () => {
            const ui = useUIStore.getState();
            if (target.type === 'note') {
                if (ui.selectedNoteId === target.note.id) {
                    flushPendingSaves();
                    ui.selectNote(null, null);
                }
                await softDeleteNote.mutateAsync({ id: target.note.id, notebookId: target.note.notebook_id });
            } else {
                flushPendingSaves();
                await softDeleteNotebook.mutateAsync(target.notebook.id);
            }
        });

    // --- Views ----------------------------------------------------------------

    const isNote = target.type === 'note';
    const icon = isNote ? <FileText size={28} /> : <Book size={28} />;
    let content: React.ReactNode;

    if (view === 'actions') {
        content = (
            <>
                <DrawerHeader icon={icon} title={title} description={isNote ? 'Note' : 'Notebook'} />
                <div className="space-y-2.5">
                    {!isNote && (
                        <>
                            <DrawerButton onClick={handleNewNote} disabled={busy}>
                                <FilePlus size={20} className="text-app-muted" /> New note
                            </DrawerButton>
                            <DrawerButton onClick={() => go('subnotebook')}>
                                <FolderPlus size={20} className="text-app-muted" /> New sub-notebook
                            </DrawerButton>
                        </>
                    )}
                    <DrawerButton onClick={() => go('rename')}>
                        <Pencil size={20} className="text-app-muted" /> Rename
                    </DrawerButton>
                    <DrawerButton onClick={() => go('move')}>
                        <FolderInput size={20} className="text-app-muted" /> Move to…
                    </DrawerButton>
                    <DrawerButton destructive onClick={() => go('trash')}>
                        <Trash2 size={20} /> Move to trash
                    </DrawerButton>
                </div>
            </>
        );
    } else if (view === 'move') {
        const currentParent = isNote ? target.note.notebook_id : target.notebook.parent_notebook_id;
        content = (
            <>
                <DrawerHeader icon={<FolderInput size={28} />} title={`Move “${title}”`} description="Choose a destination." />
                <div className="-mx-1 max-h-[45vh] overflow-y-auto px-1 space-y-1" data-vaul-no-drag="">
                    {!isNote && (
                        <MoveOption
                            label="Library (top level)"
                            icon={<Library size={18} />}
                            depth={0}
                            current={currentParent === null}
                            disabled={busy}
                            onClick={() => handleMove(null)}
                        />
                    )}
                    {tree
                        .filter(({ notebook }) => !excludedIds.has(notebook.id))
                        .map(({ notebook, depth }) => (
                            <MoveOption
                                key={notebook.id}
                                label={notebook.title}
                                icon={<Book size={18} />}
                                depth={depth}
                                current={currentParent === notebook.id}
                                disabled={busy}
                                onClick={() => handleMove(notebook.id)}
                            />
                        ))}
                    {tree.length === 0 && <p className="py-4 text-center text-sm text-app-muted">No notebooks.</p>}
                </div>
                <div className="mt-5">
                    <DrawerPillButton onClick={() => go('actions')}>Back</DrawerPillButton>
                </div>
            </>
        );
    } else if (view === 'rename' || view === 'subnotebook') {
        const isSub = view === 'subnotebook';
        content = (
            <form onSubmit={handleNameSubmit}>
                <DrawerHeader
                    icon={isSub ? <FolderPlus size={28} /> : <Pencil size={28} />}
                    title={isSub ? 'New sub-notebook' : 'Rename'}
                    description={isSub ? `Inside “${title}”` : undefined}
                />
                <input
                    autoFocus
                    data-vaul-no-drag=""
                    value={name}
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isSub ? 'Sub-notebook name' : 'Name'}
                    className="h-12 w-full rounded-2xl border border-app-border bg-app-bg px-4 text-[16px] text-app-text placeholder:text-app-muted outline-none focus:border-app-primary focus:ring-2 focus:ring-app-primary/30"
                />
                <div className="mt-5 flex gap-3">
                    <DrawerPillButton onClick={() => go('actions')}>Cancel</DrawerPillButton>
                    <DrawerPillButton type="submit" variant="primary" disabled={busy || !name.trim()}>
                        {isSub ? 'Create' : 'Save'}
                    </DrawerPillButton>
                </div>
            </form>
        );
    } else {
        content = (
            <>
                <DrawerHeader
                    icon={<Trash2 size={28} className="text-red-500" />}
                    title={`Move “${title}” to trash?`}
                    description={
                        isNote
                            ? 'You can restore it from the Wastebasket.'
                            : 'All notes and sub-notebooks inside will be moved too. You can restore them from the Wastebasket.'
                    }
                />
                <div className="flex gap-3">
                    <DrawerPillButton onClick={() => go('actions')}>Cancel</DrawerPillButton>
                    <DrawerPillButton variant="destructive" onClick={handleTrash} disabled={busy}>
                        <Trash2 size={18} /> Move to trash
                    </DrawerPillButton>
                </div>
            </>
        );
    }

    return (
        <FamilyDrawer open={open} onOpenChange={onOpenChange} viewKey={view} title={`${title} actions`}>
            {content}
            {error && (
                <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
                    {error}
                </p>
            )}
        </FamilyDrawer>
    );
}

function MoveOption({
    label,
    icon,
    depth,
    current,
    disabled,
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    depth: number;
    current: boolean;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={disabled || current}
            onClick={onClick}
            className={clsx(
                'flex h-11 w-full items-center gap-3 rounded-xl pr-3 text-left text-[15px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-app-primary/60',
                current ? 'text-app-primary bg-app-accent-bg' : 'text-app-text active:bg-app-accent-bg',
                disabled && !current && 'opacity-50'
            )}
            style={{ paddingLeft: 12 + depth * 18 }}
        >
            <span className={current ? 'text-app-primary' : 'text-app-muted'}>{icon}</span>
            <span className="flex-1 truncate">{label}</span>
            {current && <Check size={16} />}
        </button>
    );
}
