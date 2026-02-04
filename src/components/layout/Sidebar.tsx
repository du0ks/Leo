import { useState, useMemo } from 'react';
import {
    FolderPlus, Book, Trash2, Edit2, Check, X,
    ChevronRight, ChevronDown, FileText, Plus,
    RotateCcw, Loader2, FolderOpen
} from 'lucide-react';
import {
    useNotebooks,
    useCreateNotebook,
    useSoftDeleteNotebook,
    useUpdateNotebook,
    useTrashedNotebooks,
    useRestoreNotebook,
    usePermanentlyDeleteNotebook,
    useMoveNotebook
} from '../../hooks/useNotebooks';
import {
    useNotes,
    useTrashedNotes,
    useCreateNote,
    useSoftDeleteNote,
    useRestoreNote,
    usePermanentlyDeleteNote,
    useMoveNote
} from '../../hooks/useNotes';
import { useUIStore } from '../../stores/uiStore';
import { useAuth } from '../../hooks/useAuth';
import clsx from 'clsx';
import { ActionIcon } from '@mantine/core';
import type { Notebook, Note } from '../../lib/types';

// Drag and Drop imports
import {
    DndContext,
    DragOverlay,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';

// Types for drag items
type DragItemType = 'note' | 'notebook';
interface DragItem {
    type: DragItemType;
    id: string;
    notebookId?: string; // For notes, which notebook they belong to
    parentNotebookId?: string | null; // For notebooks, their parent
    title: string;
}

export function Sidebar() {
    const { user } = useAuth();
    const { data: notebooks, isLoading: notebooksLoading } = useNotebooks();

    // Local state for creating/editing notebooks
    const [isCreatingNotebook, setIsCreatingNotebook] = useState(false);
    const [isCreatingSubNotebook, setIsCreatingSubNotebook] = useState<string | null>(null); // Parent ID for sub-notebook
    const [newNotebookTitle, setNewNotebookTitle] = useState('');
    const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
    const [editNotebookTitle, setEditNotebookTitle] = useState('');

    // Drag state
    const [activeItem, setActiveItem] = useState<DragItem | null>(null);

    const createNotebook = useCreateNotebook();
    const updateNotebook = useUpdateNotebook();
    const softDeleteNotebook = useSoftDeleteNotebook();
    const moveNotebook = useMoveNotebook();
    const moveNote = useMoveNote();

    // Sensors for drag and drop - optimized for responsiveness
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 8, // 8px movement before drag starts (desktop)
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 150, // 150ms long press on mobile (faster response)
                tolerance: 5,
            },
        })
    );

    // Get root-level notebooks (no parent)
    const rootNotebooks = useMemo(() => {
        if (!notebooks) return [];
        return notebooks.filter(nb => nb.parent_notebook_id === null);
    }, [notebooks]);

    // Create a map for quick child lookup
    const childrenMap = useMemo(() => {
        if (!notebooks) return new Map<string, Notebook[]>();
        const map = new Map<string, Notebook[]>();
        notebooks.forEach(nb => {
            if (nb.parent_notebook_id) {
                const children = map.get(nb.parent_notebook_id) || [];
                children.push(nb);
                map.set(nb.parent_notebook_id, children);
            }
        });
        return map;
    }, [notebooks]);

    const handleCreateNotebook = async (parentId: string | null = null) => {
        if (!user || !newNotebookTitle.trim()) return;
        try {
            await createNotebook.mutateAsync({
                user_id: user.uid,
                title: newNotebookTitle.trim(),
                parent_notebook_id: parentId,
            });
            setNewNotebookTitle('');
            setIsCreatingNotebook(false);
            setIsCreatingSubNotebook(null);
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
        if (confirm('Move this notebook to trash? All its notes and sub-notebooks will also be trashed.')) {
            await softDeleteNotebook.mutateAsync(id);
        }
    };

    // Drag handlers
    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const dragData = active.data.current as DragItem;
        setActiveItem(dragData);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveItem(null);

        if (!over || active.id === over.id) return;

        const dragData = active.data.current as DragItem;
        const dropId = over.id as string;

        // Determine what we're dropping onto
        const droppedOnNotebook = notebooks?.find(nb => nb.id === dropId);

        if (!droppedOnNotebook) return;

        if (dragData.type === 'note') {
            // Move note to different notebook
            if (dragData.notebookId !== droppedOnNotebook.id) {
                await moveNote.mutateAsync({
                    id: dragData.id,
                    fromNotebookId: dragData.notebookId!,
                    toNotebookId: droppedOnNotebook.id,
                });
            }
        } else if (dragData.type === 'notebook') {
            // Move notebook to different parent (prevent moving to self or descendant)
            if (dragData.id !== droppedOnNotebook.id) {
                // Check if dropping onto a descendant (would create circular reference)
                const isDescendant = (parentId: string, targetId: string): boolean => {
                    const children = childrenMap.get(parentId) || [];
                    for (const child of children) {
                        if (child.id === targetId) return true;
                        if (isDescendant(child.id, targetId)) return true;
                    }
                    return false;
                };

                if (!isDescendant(dragData.id, droppedOnNotebook.id)) {
                    await moveNotebook.mutateAsync({
                        id: dragData.id,
                        newParentId: droppedOnNotebook.id,
                    });
                }
            }
        }
    };

    return (
        <DndContext
            sensors={sensors}
            modifiers={[snapCenterToCursor]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
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
                        <div className="space-y-0.5">
                            {/* Notebooks Tree */}
                            {rootNotebooks.map((notebook) => (
                                <NotebookItem
                                    key={notebook.id}
                                    notebook={notebook}
                                    childrenMap={childrenMap}
                                    depth={0}
                                    isEditing={editingNotebookId === notebook.id}
                                    editTitle={editNotebookTitle}
                                    onEditChange={setEditNotebookTitle}
                                    onEditSubmit={() => handleRenameNotebook(notebook.id)}
                                    onEditCancel={() => setEditingNotebookId(null)}
                                    onStartEdit={(id: string, title: string) => {
                                        setEditingNotebookId(id);
                                        setEditNotebookTitle(title);
                                    }}
                                    onDelete={handleDeleteNotebook}
                                    onCreateSubNotebook={(parentId: string) => {
                                        setIsCreatingSubNotebook(parentId);
                                        setNewNotebookTitle('');
                                    }}
                                    isCreatingSubNotebook={isCreatingSubNotebook}
                                    newNotebookTitle={newNotebookTitle}
                                    onNewNotebookTitleChange={setNewNotebookTitle}
                                    onSubmitSubNotebook={() => handleCreateNotebook(isCreatingSubNotebook)}
                                    onCancelSubNotebook={() => setIsCreatingSubNotebook(null)}
                                    editingNotebookId={editingNotebookId}
                                />
                            ))}

                            {/* New Root Notebook Input */}
                            {isCreatingNotebook && (
                                <div className="px-2 py-1 flex items-center gap-2 animate-fade-in">
                                    <input
                                        autoFocus
                                        className="flex-1 bg-app-bg border border-app-border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-app-primary outline-none"
                                        placeholder="Notebook name..."
                                        value={newNotebookTitle}
                                        onChange={(e) => setNewNotebookTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCreateNotebook(null);
                                            if (e.key === 'Escape') setIsCreatingNotebook(false);
                                        }}
                                    />
                                    <div className="flex gap-1">
                                        <ActionIcon size="sm" color="green" variant="subtle" onClick={() => handleCreateNotebook(null)}>
                                            <Check size={14} />
                                        </ActionIcon>
                                        <ActionIcon size="sm" color="red" variant="subtle" onClick={() => setIsCreatingNotebook(false)}>
                                            <X size={14} />
                                        </ActionIcon>
                                    </div>
                                </div>
                            )}

                            {rootNotebooks.length === 0 && !isCreatingNotebook && (
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

            {/* Drag Overlay - positioned at cursor */}
            <DragOverlay dropAnimation={null}>
                {activeItem && (
                    <div
                        className="px-2 py-1.5 rounded-md bg-app-primary text-white shadow-lg text-xs font-medium pointer-events-none"
                        style={{ transform: 'translate(-50%, -50%)' }}
                    >
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                            {activeItem.type === 'notebook' ? (
                                <Book size={12} />
                            ) : (
                                <FileText size={12} />
                            )}
                            <span className="max-w-[120px] truncate">{activeItem.title}</span>
                        </div>
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}

// --- Recursive Notebook Item ---

interface NotebookItemProps {
    notebook: Notebook;
    childrenMap: Map<string, Notebook[]>;
    depth: number;
    isEditing: boolean;
    editTitle: string;
    onEditChange: (val: string) => void;
    onEditSubmit: () => void;
    onEditCancel: () => void;
    onStartEdit: (id: string, title: string) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onCreateSubNotebook: (parentId: string) => void;
    isCreatingSubNotebook: string | null;
    newNotebookTitle: string;
    onNewNotebookTitleChange: (val: string) => void;
    onSubmitSubNotebook: () => void;
    onCancelSubNotebook: () => void;
    editingNotebookId: string | null;
}

function NotebookItem({
    notebook, childrenMap, depth, isEditing, editTitle, onEditChange, onEditSubmit, onEditCancel,
    onStartEdit, onDelete, onCreateSubNotebook, isCreatingSubNotebook, newNotebookTitle,
    onNewNotebookTitleChange, onSubmitSubNotebook, onCancelSubNotebook, editingNotebookId
}: NotebookItemProps) {
    const isExpanded = useUIStore((state) => state.expandedNotebooks.has(notebook.id));
    const toggleNotebookExpand = useUIStore((state) => state.toggleNotebookExpand);

    const { data: notes, isLoading: notesLoading } = useNotes(notebook.id);
    const createNote = useCreateNote();

    const childNotebooks = childrenMap.get(notebook.id) || [];

    // Draggable & Droppable
    const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
        id: notebook.id,
        data: {
            type: 'notebook',
            id: notebook.id,
            parentNotebookId: notebook.parent_notebook_id,
            title: notebook.title
        } as DragItem,
    });

    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: notebook.id,
    });

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

    const handleAddSubNotebook = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isExpanded) toggleNotebookExpand(notebook.id, true);
        onCreateSubNotebook(notebook.id);
    };

    // Combine refs for both drag and drop
    const combineRefs = (el: HTMLDivElement | null) => {
        setDragRef(el);
        setDropRef(el);
    };

    if (isEditing) {
        return (
            <div className="px-2 py-1 flex items-center gap-1" style={{ paddingLeft: `${8 + depth * 16}px` }}>
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
                ref={combineRefs}
                {...attributes}
                {...listeners}
                className={clsx(
                    "group flex items-center gap-2 py-1.5 rounded-md cursor-pointer text-app-text transition-colors",
                    isOver && !isDragging && "bg-app-primary/20 ring-1 ring-app-primary",
                    isDragging && "opacity-40",
                    !isOver && !isDragging && "hover:bg-app-accent-bg"
                )}
                style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px' }}
                onClick={() => toggleNotebookExpand(notebook.id)}
            >
                {/* Expand/Collapse Chevron */}
                <div className="text-app-muted group-hover:text-app-primary transition-colors w-4 flex-shrink-0">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>

                {/* Icon */}
                {isExpanded ? (
                    <FolderOpen size={16} className="text-app-primary flex-shrink-0" />
                ) : (
                    <Book size={16} className="text-app-primary/80 flex-shrink-0" />
                )}

                {/* Title */}
                <span className="flex-1 text-sm font-medium truncate">{notebook.title}</span>

                {/* Action Buttons */}
                <div className={clsx(
                    "flex items-center gap-0.5 transition-opacity",
                    isExpanded ? "opacity-100" : "opacity-0 lg:group-hover:opacity-100"
                )}>
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={handleCreateNote}
                        title="Add Note"
                    >
                        <Plus size={12} />
                    </ActionIcon>
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={handleAddSubNotebook}
                        title="Add Sub-Notebook"
                    >
                        <FolderPlus size={12} />
                    </ActionIcon>
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={(e) => { e.stopPropagation(); onStartEdit(notebook.id, notebook.title); }}
                        title="Rename"
                    >
                        <Edit2 size={12} />
                    </ActionIcon>
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={(e) => onDelete(notebook.id, e)}
                        title="Delete"
                    >
                        <Trash2 size={12} />
                    </ActionIcon>
                </div>
            </div>

            {/* Expanded Content: Notes + Sub-Notebooks */}
            {isExpanded && (
                <div className="animate-fade-in">
                    {/* Notes */}
                    {notesLoading ? (
                        <div className="py-2" style={{ paddingLeft: `${24 + depth * 16}px` }}>
                            <Loader2 size={14} className="animate-spin text-app-muted" />
                        </div>
                    ) : (
                        notes?.map((note) => (
                            <NoteItem key={note.id} note={note} depth={depth + 1} />
                        ))
                    )}

                    {/* Sub-Notebooks (recursive) */}
                    {childNotebooks.map((child) => (
                        <NotebookItem
                            key={child.id}
                            notebook={child}
                            childrenMap={childrenMap}
                            depth={depth + 1}
                            isEditing={editingNotebookId === child.id}
                            editTitle={editTitle}
                            onEditChange={onEditChange}
                            onEditSubmit={onEditSubmit}
                            onEditCancel={onEditCancel}
                            onStartEdit={onStartEdit}
                            onDelete={onDelete}
                            onCreateSubNotebook={onCreateSubNotebook}
                            isCreatingSubNotebook={isCreatingSubNotebook}
                            newNotebookTitle={newNotebookTitle}
                            onNewNotebookTitleChange={onNewNotebookTitleChange}
                            onSubmitSubNotebook={onSubmitSubNotebook}
                            onCancelSubNotebook={onCancelSubNotebook}
                            editingNotebookId={editingNotebookId}
                        />
                    ))}

                    {/* New Sub-Notebook Input */}
                    {isCreatingSubNotebook === notebook.id && (
                        <div
                            className="flex items-center gap-2 py-1 animate-fade-in"
                            style={{ paddingLeft: `${24 + depth * 16}px`, paddingRight: '8px' }}
                        >
                            <input
                                autoFocus
                                className="flex-1 bg-app-bg border border-app-border rounded px-2 py-1 text-sm focus:ring-1 focus:ring-app-primary outline-none"
                                placeholder="Sub-notebook name..."
                                value={newNotebookTitle}
                                onChange={(e) => onNewNotebookTitleChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') onSubmitSubNotebook();
                                    if (e.key === 'Escape') onCancelSubNotebook();
                                }}
                            />
                            <div className="flex gap-1">
                                <ActionIcon size="sm" color="green" variant="subtle" onClick={onSubmitSubNotebook}>
                                    <Check size={14} />
                                </ActionIcon>
                                <ActionIcon size="sm" color="red" variant="subtle" onClick={onCancelSubNotebook}>
                                    <X size={14} />
                                </ActionIcon>
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {!notesLoading && notes?.length === 0 && childNotebooks.length === 0 && isCreatingSubNotebook !== notebook.id && (
                        <div
                            className="py-1 text-xs text-app-muted italic cursor-pointer hover:text-app-primary"
                            style={{ paddingLeft: `${24 + depth * 16}px` }}
                            onClick={handleCreateNote}
                        >
                            Empty. Click to add note.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function NoteItem({ note, depth }: { note: Note; depth: number }) {
    const selectedNoteId = useUIStore((state) => state.selectedNoteId);
    const selectNote = useUIStore((state) => state.selectNote);
    const softDeleteNote = useSoftDeleteNote();

    // Draggable for the note
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `note-${note.id}`,
        data: {
            type: 'note',
            id: note.id,
            notebookId: note.notebook_id,
            title: note.title || 'Untitled'
        } as DragItem,
    });

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Move note to trash?')) {
            await softDeleteNote.mutateAsync({ id: note.id, notebookId: note.notebook_id });
            if (selectedNoteId === note.id) selectNote(null, null);
        }
    };

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className={clsx(
                "group flex items-center gap-2 py-1.5 rounded-md cursor-pointer transition-colors text-sm",
                isDragging && "opacity-40",
                selectedNoteId === note.id
                    ? "bg-app-primary/10 text-app-primary font-medium"
                    : "text-app-text/80 hover:bg-app-accent-bg hover:text-app-text"
            )}
            style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px' }}
            onClick={() => selectNote(note.id, note.notebook_id)}
        >
            <div className="w-4 flex-shrink-0" /> {/* Spacer to align with chevron */}
            <FileText size={14} className={clsx(
                "flex-shrink-0",
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
                <div className="w-4 flex-shrink-0">
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
                <div className="pl-6 mt-1 space-y-0.5 animate-fade-in">
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
                                        <div className="w-4 flex-shrink-0 text-app-muted">
                                            {expandedNotebookIds.has(notebook.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                        </div>
                                        <Book size={14} className="text-app-muted flex-shrink-0" />
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
                                        <div className="pl-6 space-y-0.5">
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
                                                    <div className="w-4 flex-shrink-0" />
                                                    <FileText size={12} className="text-app-muted flex-shrink-0" />
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
                                            <div className="w-4 flex-shrink-0" />
                                            <FileText size={14} className="text-app-muted flex-shrink-0" />
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
