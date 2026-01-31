import { useState } from 'react';
import {
    FolderPlus, Book, Trash2, Edit2, Check, X,
    ChevronRight, ChevronDown, FileText, Plus,
    RotateCcw, Loader2
} from 'lucide-react';
import {
    useNotebooks,
    useCreateNotebook,
    useSoftDeleteNotebook,
    useUpdateNotebook,
    useTrashedNotebooks,
    useRestoreNotebook,
    usePermanentlyDeleteNotebook
} from '../../hooks/useNotebooks';
import {
    useNotes,
    useTrashedNotes,
    useCreateNote,
    useSoftDeleteNote,
    useRestoreNote,
    usePermanentlyDeleteNote
} from '../../hooks/useNotes';
import { useUIStore } from '../../stores/uiStore';
import { useAuth } from '../../hooks/useAuth';
import clsx from 'clsx';
import { ActionIcon } from '@mantine/core';

export function Sidebar() {
    const { user } = useAuth();
    const { data: notebooks, isLoading: notebooksLoading } = useNotebooks();

    // Local state for creating/editing notebooks
    const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);
    const [newNotebookTitle, setNewNotebookTitle] = useState('');
    const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
    const [editNotebookTitle, setEditNotebookTitle] = useState('');

    const createNotebook = useCreateNotebook();
    const updateNotebook = useUpdateNotebook();
    const softDeleteNotebook = useSoftDeleteNotebook();

    const handleCreateNotebook = async () => {
        if (!user || !newNotebookTitle.trim()) return;
        try {
            await createNotebook.mutateAsync({
                user_id: user.uid,
                title: newNotebookTitle.trim(),
            });
            setNewNotebookTitle('');
            setIsCreatingNotebook(false);
        } catch (error: any) {
            console.error('Failed to create notebook:', error);
            window.alert('Error creating notebook: ' + (error.message || 'Check your internet or Firestore rules.'));
        }
    };

    const handleRenameNotebook = async (id: string) => {
        if (!editNotebookTitle.trim()) {
            setEditingNotebookId(null);
            return;
        }
        await updateNotebook.mutateAsync({ id, title: editNotebookTitle.trim() });
        setEditingNotebookId(null);
    };

    const handleDeleteNotebook = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Move this notebook to trash? All its notes will also be trashed.')) {
            await softDeleteNotebook.mutateAsync(id);
        }
    };

    return (
        <div className="w-64 h-full bg-app-surface border-r border-app-border flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-app-border flex items-center justify-between">
                <h2 className="text-lg font-semibold text-app-text">Library</h2>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => setIsCreatingNotebook(true)}
                    title="New Notebook"
                >
                    <FolderPlus size={18} />
                </ActionIcon>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
                {notebooksLoading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="animate-spin text-app-muted" size={20} />
                    </div>
                ) : (
                    <div className="space-y-1">
                        {/* Notebooks List */}
                        {notebooks?.map((notebook) => (
                            <NotebookItem
                                key={notebook.id}
                                notebook={notebook}
                                isEditing={editingNotebookId === notebook.id}
                                editTitle={editNotebookTitle}
                                onEditChange={setEditNotebookTitle}
                                onEditSubmit={() => handleRenameNotebook(notebook.id)}
                                onEditCancel={() => setEditingNotebookId(null)}
                                onStartEdit={() => {
                                    setEditingNotebookId(notebook.id);
                                    setEditNotebookTitle(notebook.title);
                                }}
                                onDelete={(e: React.MouseEvent) => handleDeleteNotebook(notebook.id, e)}
                            />
                        ))}

                        {/* New Notebook Input */}
                        {isCreatingNotebook && (
                            <div className="px-2 py-1 flex items-center gap-2 animate-fade-in">
                                <input
                                    autoFocus
                                    className="flex-1 bg-app-bg border border-app-border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-app-primary outline-none"
                                    placeholder="Notebook name..."
                                    value={newNotebookTitle}
                                    onChange={(e) => setNewNotebookTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateNotebook();
                                        if (e.key === 'Escape') setIsCreatingNotebook(false);
                                    }}
                                />
                                <div className="flex gap-1">
                                    <ActionIcon size="sm" color="green" variant="subtle" onClick={handleCreateNotebook}>
                                        <Check size={14} />
                                    </ActionIcon>
                                    <ActionIcon size="sm" color="red" variant="subtle" onClick={() => setIsCreatingNotebook(false)}>
                                        <X size={14} />
                                    </ActionIcon>
                                </div>
                            </div>
                        )}

                        {notebooks?.length === 0 && !isCreatingNotebook && (
                            <p className="text-center text-app-muted text-xs py-4">No notebooks yet</p>
                        )}

                        {/* Trash Section */}
                        <div className="mt-6 pt-2 border-t border-app-border/50">
                            <WastebasketSection />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Sub Components ---

function NotebookItem({
    notebook, isEditing, editTitle, onEditChange, onEditSubmit, onEditCancel, onStartEdit, onDelete
}: any) {
    // Selector returns boolean -> efficient re-render control
    const isExpanded = useUIStore((state) => state.expandedNotebooks.has(notebook.id));
    const toggleNotebookExpand = useUIStore((state) => state.toggleNotebookExpand);

    const { data: notes, isLoading: notesLoading } = useNotes(notebook.id);
    const createNote = useCreateNote();

    const handleCreateNote = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isExpanded) toggleNotebookExpand(notebook.id, true);

        try {
            await createNote.mutateAsync({
                notebook_id: notebook.id,
                title: 'Untitled Note',
                content: [],
            });
        } catch (err) {
            console.error(err);
        }
    };

    if (isEditing) {
        return (
            <div className="px-2 py-1 flex items-center gap-1">
                <input
                    autoFocus
                    className="min-w-0 flex-1 bg-app-bg border border-app-border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-app-primary outline-none"
                    value={editTitle}
                    onChange={(e) => onEditChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onEditSubmit();
                        if (e.key === 'Escape') onEditCancel();
                    }}
                />
                <ActionIcon size="sm" color="green" variant="subtle" onClick={onEditSubmit}>
                    <Check size={14} />
                </ActionIcon>
                <ActionIcon size="sm" color="red" variant="subtle" onClick={onEditCancel}>
                    <X size={14} />
                </ActionIcon>
            </div>
        );
    }

    return (
        <div className="select-none">
            <div
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-app-accent-bg cursor-pointer text-app-text transition-colors"
                onClick={() => toggleNotebookExpand(notebook.id)}
            >
                <div className="text-app-muted group-hover:text-app-primary transition-colors">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                <Book size={16} className="text-app-primary/80" />
                <span className="flex-1 text-sm font-medium truncate">{notebook.title}</span>

                <div className={clsx(
                    "flex items-center gap-1 transition-opacity",
                    isExpanded ? "opacity-100" : "opacity-0 lg:group-hover:opacity-100"
                )}>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={handleCreateNote}
                        title="Add Note"
                    >
                        <Plus size={14} />
                    </ActionIcon>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
                        title="Rename"
                    >
                        <Edit2 size={14} />
                    </ActionIcon>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        onClick={onDelete}
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </ActionIcon>
                </div>
            </div>

            {isExpanded && (
                <div className="pl-6 border-l border-app-border/40 ml-2.5 mt-1 space-y-0.5 animate-fade-in">
                    {notesLoading ? (
                        <div className="py-2 pl-2">
                            <Loader2 size={14} className="animate-spin text-app-muted" />
                        </div>
                    ) : notes?.length === 0 ? (
                        <div
                            className="py-1 pl-2 text-xs text-app-muted italic cursor-pointer hover:text-app-primary"
                            onClick={handleCreateNote}
                        >
                            Empty. Click to add note.
                        </div>
                    ) : (
                        notes?.map((note) => (
                            <NoteItem key={note.id} note={note} />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function NoteItem({ note }: { note: any }) {
    const selectedNoteId = useUIStore((state) => state.selectedNoteId);
    const selectNote = useUIStore((state) => state.selectNote);
    const softDeleteNote = useSoftDeleteNote();

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Move note to trash?')) {
            await softDeleteNote.mutateAsync({ id: note.id, notebookId: note.notebook_id });
            if (selectedNoteId === note.id) selectNote(null, null);
        }
    };

    return (
        <div
            className={clsx(
                "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all text-sm",
                selectedNoteId === note.id
                    ? "bg-app-primary/10 text-app-primary font-medium"
                    : "text-app-text/80 hover:bg-app-accent-bg hover:text-app-text"
            )}
            onClick={() => selectNote(note.id, note.notebook_id)}
        >
            <FileText size={14} className={clsx(
                selectedNoteId === note.id ? "text-app-primary" : "text-app-muted group-hover:text-app-text"
            )} />
            <span className="flex-1 truncate">{note.title || 'Untitled'}</span>
            <button
                className={clsx(
                    "p-1 text-app-muted hover:text-red-500 transition-all",
                    selectedNoteId === note.id ? "opacity-100" : "opacity-0 lg:group-hover:opacity-100"
                )}
                onClick={handleDelete}
                title="Move to Trash"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
}

function WastebasketSection() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedNotebookIds, setExpandedNotebookIds] = useState<Set<string>>(new Set());
    const { data: trashedNotes } = useTrashedNotes();
    const { data: trashedNotebooks } = useTrashedNotebooks();

    const selectedNoteId = useUIStore((state) => state.selectedNoteId);
    const selectNote = useUIStore((state) => state.selectNote);

    const restoreNote = useRestoreNote();
    const permDeleteNote = usePermanentlyDeleteNote();
    const restoreNotebook = useRestoreNotebook();
    const permDeleteNotebook = usePermanentlyDeleteNotebook();

    // Get IDs of trashed notebooks
    const trashedNotebookIds = new Set(trashedNotebooks?.map(nb => nb.id) || []);

    // Filter notes: only show notes whose notebook is NOT trashed (orphan notes)
    const orphanTrashedNotes = trashedNotes?.filter(note => !trashedNotebookIds.has(note.notebook_id)) || [];

    // Group notes by their trashed notebook
    const notesByNotebook: Record<string, typeof trashedNotes> = {};
    trashedNotes?.forEach(note => {
        if (trashedNotebookIds.has(note.notebook_id)) {
            if (!notesByNotebook[note.notebook_id]) {
                notesByNotebook[note.notebook_id] = [];
            }
            notesByNotebook[note.notebook_id]!.push(note);
        }
    });

    const totalTrashed = (orphanTrashedNotes.length) + (trashedNotebooks?.length ?? 0);

    const toggleNotebookExpand = (id: string) => {
        setExpandedNotebookIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleClearWastebasket = async () => {
        if (!confirm("Permanently delete ALL items in the wastebasket? This cannot be undone.")) return;

        for (const nb of trashedNotebooks || []) {
            await permDeleteNotebook.mutateAsync(nb.id);
        }
        for (const note of orphanTrashedNotes) {
            await permDeleteNote.mutateAsync({ id: note.id, notebookId: note.notebook_id });
        }
    };

    return (
        <div className="select-none">
            <div
                className={clsx(
                    "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                    isExpanded ? "text-red-500 bg-red-500/5" : "text-app-muted hover:text-red-500 hover:bg-app-accent-bg"
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="transition-transform duration-200">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                <Trash2 size={16} />
                <span className="flex-1 text-sm font-medium">Wastebasket</span>
                {totalTrashed > 0 && (
                    <div className="flex items-center gap-1">
                        <span className="text-xs bg-app-border px-1.5 rounded-full">{totalTrashed}</span>
                        <button
                            title="Clear Wastebasket"
                            onClick={(e) => { e.stopPropagation(); handleClearWastebasket(); }}
                            className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>

            {isExpanded && (
                <div className="pl-3 border-l border-red-500/20 ml-2.5 mt-3 space-y-2 animate-fade-in">
                    {totalTrashed === 0 ? (
                        <div className="py-1 pl-2 text-xs text-app-muted italic">Wastebasket is empty</div>
                    ) : (
                        <>
                            {trashedNotebooks?.map((notebook) => (
                                <div key={notebook.id} className="space-y-0.5">
                                    <div
                                        className="group flex items-center gap-2 px-2 py-1.5 rounded-md transition-all text-sm opacity-75 hover:opacity-100 text-app-text/70 hover:bg-app-accent-bg cursor-pointer"
                                        onClick={() => toggleNotebookExpand(notebook.id)}
                                    >
                                        <div className="text-app-muted">
                                            {expandedNotebookIds.has(notebook.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                        </div>
                                        <Book size={14} className="text-app-muted" />
                                        <span className="flex-1 truncate line-through decoration-red-500/50">{notebook.title}</span>
                                        {notesByNotebook[notebook.id]?.length ? (
                                            <span className="text-[10px] text-app-muted">{notesByNotebook[notebook.id]?.length}</span>
                                        ) : null}
                                        <div className="flex items-center gap-1">
                                            <button
                                                title="Restore Notebook"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    restoreNotebook.mutateAsync(notebook.id);
                                                }}
                                                className="p-1 text-green-500 hover:bg-green-500/10 rounded"
                                            >
                                                <RotateCcw size={12} />
                                            </button>
                                            <button
                                                title="Delete Permanently"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm("Delete notebook and ALL its notes permanently?")) {
                                                        permDeleteNotebook.mutateAsync(notebook.id);
                                                    }
                                                }}
                                                className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {expandedNotebookIds.has(notebook.id) && notesByNotebook[notebook.id]?.length! > 0 && (
                                        <div className="pl-5 space-y-0.5">
                                            {notesByNotebook[notebook.id]?.map((note) => (
                                                <div
                                                    key={note.id}
                                                    className={clsx(
                                                        "group flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-all text-xs opacity-75 hover:opacity-100",
                                                        selectedNoteId === note.id
                                                            ? "bg-red-500/10 text-red-500"
                                                            : "text-app-text/60 hover:bg-app-accent-bg"
                                                    )}
                                                    onClick={() => selectNote(note.id, note.notebook_id, true)}
                                                >
                                                    <FileText size={12} className="text-app-muted" />
                                                    <span className="flex-1 truncate line-through decoration-red-500/50">{note.title || 'Untitled'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {orphanTrashedNotes.length > 0 && (
                                <div className="space-y-0.5">
                                    {trashedNotebooks?.length! > 0 && (
                                        <p className="text-[10px] uppercase tracking-wider text-app-muted font-bold px-2 mt-3 mb-2">Notes</p>
                                    )}
                                    {orphanTrashedNotes.map((note) => (
                                        <div
                                            key={note.id}
                                            className={clsx(
                                                "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all text-sm opacity-75 hover:opacity-100",
                                                selectedNoteId === note.id
                                                    ? "bg-red-500/10 text-red-500"
                                                    : "text-app-text/70 hover:bg-app-accent-bg"
                                            )}
                                            onClick={() => selectNote(note.id, note.notebook_id, true)}
                                        >
                                            <FileText size={14} className="text-app-muted" />
                                            <span className="flex-1 truncate line-through decoration-red-500/50">{note.title || 'Untitled'}</span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    title="Restore Note"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        restoreNote.mutateAsync({ id: note.id, notebookId: note.notebook_id });
                                                    }}
                                                    className="p-1 text-green-500 hover:bg-green-500/10 rounded"
                                                >
                                                    <RotateCcw size={12} />
                                                </button>
                                                <button
                                                    title="Delete Forever"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm("Delete note permanently?")) {
                                                            permDeleteNote.mutateAsync({ id: note.id, notebookId: note.notebook_id });
                                                        }
                                                    }}
                                                    className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

