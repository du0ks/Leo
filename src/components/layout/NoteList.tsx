import { useState } from 'react';
import { FilePlus, FileText, Trash2, Loader2, RotateCcw } from 'lucide-react';
import { useNotes, useTrashedNotes, useSoftDeleteNote, useRestoreNote, usePermanentlyDeleteNote, useCreateNote } from '../../hooks/useNotes';
import { useUIStore } from '../../stores/uiStore';
import clsx from 'clsx';

export function NoteList() {
    const { selectedNotebookId, selectedNoteId, selectNote, isTrashView } = useUIStore();

    const { data: regularNotes, isLoading: isRegularLoading } = useNotes(selectedNotebookId);
    const { data: trashedNotes, isLoading: isTrashedLoading } = useTrashedNotes();

    const notes = isTrashView ? trashedNotes : regularNotes;
    const isLoading = isTrashView ? isTrashedLoading : isRegularLoading;

    const createNote = useCreateNote();
    const softDeleteNote = useSoftDeleteNote();
    const restoreNote = useRestoreNote();
    const permanentlyDeleteNote = usePermanentlyDeleteNote();

    const [isCreating, setIsCreating] = useState(false);

    const handleCreate = async () => {
        if (!selectedNotebookId) return;

        setIsCreating(true);
        try {
            const note = await createNote.mutateAsync({
                notebook_id: selectedNotebookId,
                title: 'Untitled Note',
                content: [],
            });
            selectNote(note.id);
        } catch (error) {
            console.error('Failed to create note:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleSoftDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!selectedNotebookId) return;

        if (confirm('Move this note to trash?')) {
            await softDeleteNote.mutateAsync({ id, notebookId: selectedNotebookId });
            if (selectedNoteId === id) {
                selectNote(null);
            }
        }
    };

    const handleRestore = async (e: React.MouseEvent, id: string, notebookId: string) => {
        e.stopPropagation();
        await restoreNote.mutateAsync({ id, notebookId });
    };

    const handlePermanentDelete = async (e: React.MouseEvent, id: string, notebookId: string) => {
        e.stopPropagation();
        if (confirm('Permanently delete this note? This cannot be undone.')) {
            await permanentlyDeleteNote.mutateAsync({ id, notebookId });
            if (selectedNoteId === id) {
                selectNote(null);
            }
        }
    };

    if (!selectedNotebookId && !isTrashView) {
        return (
            <div className="w-72 h-full bg-app-surface/30 border-r border-app-border flex items-center justify-center">
                <p className="text-app-muted text-sm italic">Select a notebook</p>
            </div>
        );
    }

    return (
        <div className="w-72 h-full bg-app-surface/30 border-r border-app-border flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-app-border flex items-center justify-between bg-app-surface/50">
                <h2 className="text-lg font-semibold text-app-text">
                    {isTrashView ? 'Trash' : 'Notes'}
                </h2>
                {!isTrashView && (
                    <button
                        onClick={handleCreate}
                        disabled={isCreating}
                        className="p-2 rounded-lg hover:bg-app-accent-bg transition-colors disabled:opacity-50 text-app-primary"
                        title="New Note"
                    >
                        {isCreating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <FilePlus className="w-4 h-4" />
                        )}
                    </button>
                )}
            </div>

            {/* Note List */}
            <div className="flex-1 overflow-y-auto p-2">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-app-primary" />
                    </div>
                ) : notes?.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-app-muted text-sm">
                            {isTrashView ? 'Trash is empty' : 'No notes yet'}
                        </p>
                        {!isTrashView && (
                            <button
                                onClick={handleCreate}
                                className="mt-2 text-app-primary hover:underline text-sm font-medium"
                            >
                                Create your first note
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {notes?.map((note) => (
                            <li key={note.id}>
                                <div
                                    onClick={() => selectNote(note.id)}
                                    className={clsx(
                                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left group transition-all cursor-pointer border border-transparent',
                                        selectedNoteId === note.id
                                            ? 'bg-app-accent-bg border-app-primary/20 text-app-primary font-medium'
                                            : 'text-app-text hover:bg-app-accent-bg hover:border-app-border'
                                    )}
                                >
                                    <FileText className="w-4 h-4 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm truncate">{note.title || 'Untitled Note'}</p>
                                        <p className="text-[10px] text-app-muted uppercase tracking-wider">
                                            {isTrashView ? 'Deleted: ' : ''}
                                            {new Date(isTrashView ? (note.deleted_at || note.updated_at) : note.updated_at).toLocaleDateString()}
                                        </p>
                                    </div>

                                    <div className="hidden group-hover:flex items-center gap-1">
                                        {isTrashView ? (
                                            <>
                                                <button
                                                    onClick={(e) => handleRestore(e, note.id, note.notebook_id)}
                                                    className="p-1 hover:bg-app-bg rounded text-green-500"
                                                    title="Restore"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={(e) => handlePermanentDelete(e, note.id, note.notebook_id)}
                                                    className="p-1 hover:bg-app-bg rounded text-red-500"
                                                    title="Delete Permanently"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={(e) => handleSoftDelete(e, note.id)}
                                                className="p-1 hover:bg-app-bg rounded text-app-muted hover:text-red-500"
                                                title="Move to Trash"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
