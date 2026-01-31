import { useState, useCallback, useEffect, useRef } from 'react';
import { Save, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useNote, useUpdateNote, useRestoreNote, usePermanentlyDeleteNote } from '../../hooks/useNotes';
import { useUIStore } from '../../stores/uiStore';
import { NoteEditor } from '../editor/NoteEditor';
import type { Block } from '@blocknote/core';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import clsx from 'clsx';

export function MainView() {
    const { selectedNoteId, isTrashView } = useUIStore();
    const { data: note, isLoading } = useNote(selectedNoteId);
    const updateNote = useUpdateNote();
    const restoreNote = useRestoreNote();
    const permanentlyDeleteNote = usePermanentlyDeleteNote();

    const [title, setTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const lastInitializedId = useRef<string | null>(null);

    useEffect(() => {
        if (note && selectedNoteId !== lastInitializedId.current) {
            setTitle(note.title);
            lastInitializedId.current = selectedNoteId;
        }
    }, [note, selectedNoteId]);

    const debouncedSaveContent = useDebouncedCallback(
        async (content: Block[]) => {
            if (!selectedNoteId || note?.deleted_at) return;
            setIsSaving(true);
            try {
                await updateNote.mutateAsync({ id: selectedNoteId, content });
            } finally {
                setIsSaving(false);
            }
        },
        1500
    );

    const debouncedSaveTitle = useDebouncedCallback(
        async (newTitle: string) => {
            if (!selectedNoteId || note?.deleted_at) return;
            setIsSaving(true);
            try {
                await updateNote.mutateAsync({ id: selectedNoteId, title: newTitle });
            } finally {
                setIsSaving(false);
            }
        },
        1000
    );

    const handleTitleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newTitle = e.target.value;
            setTitle(newTitle);
            debouncedSaveTitle(newTitle);
        },
        [debouncedSaveTitle]
    );

    const handleContentChange = useCallback(
        (content: Block[]) => {
            debouncedSaveContent(content);
        },
        [debouncedSaveContent]
    );

    const handleRestore = async () => {
        if (!note) return;
        await restoreNote.mutateAsync({ id: note.id, notebookId: note.notebook_id });
    };

    const handlePermanentDelete = async () => {
        if (!note) return;
        if (confirm('Permanently delete this note?')) {
            await permanentlyDeleteNote.mutateAsync({ id: note.id, notebookId: note.notebook_id });
        }
    };

    if (!selectedNoteId) {
        return (
            <div className="flex-1 flex items-center justify-center bg-dark-bg">
                <div className="text-center">
                    <p className="text-dark-muted text-lg">
                        {isTrashView ? 'Select a trashed note to preview' : 'Select a note to start editing'}
                    </p>
                </div>
            </div>
        );
    }

    if (isLoading && !note) {
        return (
            <div className="flex-1 flex items-center justify-center bg-dark-bg">
                <Loader2 className="w-8 h-8 animate-spin text-dark-muted" />
            </div>
        );
    }

    if (!note && !isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-dark-bg">
                <p className="text-dark-muted">Note not found</p>
            </div>
        );
    }

    const isTrashed = !!note?.deleted_at;

    return (
        <div className="flex-1 flex flex-col bg-dark-bg overflow-hidden">
            {/* Title Bar */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-dark-border bg-dark-surface/30">
                <input
                    type="text"
                    value={title}
                    onChange={handleTitleChange}
                    placeholder="Untitled Note"
                    readOnly={isTrashed}
                    className={clsx(
                        "flex-1 text-2xl font-semibold bg-transparent text-dark-text placeholder-dark-muted focus:outline-none",
                        isTrashed && "opacity-50"
                    )}
                />

                {isTrashed ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRestore}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors text-sm font-medium"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Restore
                        </button>
                        <button
                            onClick={handlePermanentDelete}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                            title="Delete Permanently"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-dark-muted">
                        {isSaving || updateNote.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        <span className="text-xs">{(isSaving || updateNote.isPending) ? 'Saving...' : 'Saved'}</span>
                    </div>
                )}
            </div>

            {/* Editor */}
            <div className={clsx("flex-1 overflow-auto px-4", isTrashed && "opacity-80 grayscale-[0.2]")}>
                {isTrashed && (
                    <div className="mx-6 my-4 p-3 bg-red-900/10 border border-red-900/20 rounded-lg flex items-center gap-3 text-red-400 text-sm">
                        <Trash2 className="w-4 h-4 shrink-0" />
                        <span>This note is in the trash. You can preview it, but you must restore it to edit.</span>
                    </div>
                )}
                <NoteEditor
                    key={selectedNoteId}
                    content={note?.content ?? []}
                    onChange={handleContentChange}
                    editable={!isTrashed}
                />
            </div>
        </div>
    );
}
