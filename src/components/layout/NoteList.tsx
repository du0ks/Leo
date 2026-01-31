import { useState } from 'react';
import { FilePlus, FileText, Trash2, Loader2 } from 'lucide-react';
import { useNotes, useCreateNote, useDeleteNote } from '../../hooks/useNotes';
import { useUIStore } from '../../stores/uiStore';
import clsx from 'clsx';

export function NoteList() {
    const { selectedNotebookId, selectedNoteId, selectNote } = useUIStore();
    const { data: notes, isLoading } = useNotes(selectedNotebookId);
    const createNote = useCreateNote();
    const deleteNote = useDeleteNote();

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

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!selectedNotebookId) return;

        if (confirm('Delete this note?')) {
            await deleteNote.mutateAsync({ id, notebookId: selectedNotebookId });
            if (selectedNoteId === id) {
                selectNote(null);
            }
        }
    };

    if (!selectedNotebookId) {
        return (
            <div className="w-72 h-full bg-dark-surface/50 border-r border-dark-border flex items-center justify-center">
                <p className="text-dark-muted text-sm">Select a notebook</p>
            </div>
        );
    }

    return (
        <div className="w-72 h-full bg-dark-surface/50 border-r border-dark-border flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-dark-border flex items-center justify-between">
                <h2 className="text-lg font-semibold text-dark-text">Notes</h2>
                <button
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="p-2 rounded-lg hover:bg-dark-border transition-colors disabled:opacity-50"
                    title="New Note"
                >
                    {isCreating ? (
                        <Loader2 className="w-4 h-4 animate-spin text-dark-muted" />
                    ) : (
                        <FilePlus className="w-4 h-4 text-dark-muted" />
                    )}
                </button>
            </div>

            {/* Note List */}
            <div className="flex-1 overflow-y-auto p-2">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-dark-muted" />
                    </div>
                ) : notes?.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-dark-muted text-sm">No notes yet</p>
                        <button
                            onClick={handleCreate}
                            className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
                        >
                            Create your first note
                        </button>
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {notes?.map((note) => (
                            <li key={note.id}>
                                <button
                                    onClick={() => selectNote(note.id)}
                                    className={clsx(
                                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left group transition-colors',
                                        selectedNoteId === note.id
                                            ? 'bg-blue-600/20 text-blue-400'
                                            : 'text-dark-text hover:bg-dark-border'
                                    )}
                                >
                                    <FileText className="w-4 h-4 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{note.title}</p>
                                        <p className="text-xs text-dark-muted">
                                            {new Date(note.updated_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => handleDelete(e, note.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                handleDelete(e as unknown as React.MouseEvent, note.id);
                                            }
                                        }}
                                        className="hidden group-hover:block p-1 hover:bg-dark-bg rounded text-red-400 cursor-pointer"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
