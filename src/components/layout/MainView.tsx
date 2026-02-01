import { useState, useCallback, useEffect, useRef } from 'react';

import { useNote, useUpdateNote, useRestoreNote, usePermanentlyDeleteNote } from '../../hooks/useNotes';
import { useUIStore } from '../../stores/uiStore';
import { NoteEditor } from '../editor/NoteEditor';
import type { Block } from '@blocknote/core';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import clsx from 'clsx';
import {
    Loader2,
    RotateCcw,
    Trash2,
    AlertCircle
} from 'lucide-react';

export function MainView() {
    const { selectedNoteId, selectedNotebookId, isTrashView } = useUIStore();
    const { data: note, isLoading } = useNote(selectedNoteId, selectedNotebookId);
    const updateNote = useUpdateNote();
    const restoreNote = useRestoreNote();
    const permanentlyDeleteNote = usePermanentlyDeleteNote();
    const isOnline = useOnlineStatus();

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
                await updateNote.mutateAsync({ id: selectedNoteId, notebookId: selectedNotebookId!, content });
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
                await updateNote.mutateAsync({ id: selectedNoteId, notebookId: selectedNotebookId!, title: newTitle });
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
            <div className="flex-1 flex items-center justify-center bg-app-bg">
                <div className="text-center animate-fade-in group">
                    <div className="w-24 h-24 mx-auto mb-6 transition-transform duration-500 group-hover:scale-110">
                        <img src="/leo.png" alt="Leo" className="w-full h-full object-contain opacity-20 group-hover:opacity-40 transition-opacity" />
                    </div>
                    <p className="text-app-muted text-lg font-medium">
                        {isTrashView ? 'Select a trashed note to preview' : 'Select a note to start writing'}
                    </p>
                </div>
            </div>
        );
    }

    if (isLoading && !note) {
        return (
            <div className="flex-1 flex items-center justify-center bg-app-bg">
                <Loader2 className="w-8 h-8 animate-spin text-app-primary" />
            </div>
        );
    }

    if (!note && !isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-app-bg">
                <p className="text-app-muted">Note not found</p>
            </div>
        );
    }

    const isTrashed = !!note?.deleted_at;

    return (
        <div className="flex-1 flex flex-col bg-app-bg overflow-hidden transition-all duration-300">
            {/* Title Bar */}
            <div className="flex items-center gap-3 px-8 py-6 border-b border-app-border bg-app-surface/20">
                <input
                    type="text"
                    value={title}
                    onChange={handleTitleChange}
                    placeholder="Untitled Note"
                    readOnly={isTrashed}
                    className={clsx(
                        "flex-1 text-3xl font-bold bg-transparent text-app-text placeholder-app-muted focus:outline-none transition-opacity",
                        isTrashed && "opacity-50"
                    )}
                />

                {isTrashed ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRestore}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-all text-sm font-semibold border border-green-500/20"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Restore
                        </button>
                        <button
                            onClick={handlePermanentDelete}
                            className="p-2 rounded-xl hover:bg-red-500/10 text-red-500 transition-all border border-transparent hover:border-red-500/20"
                            title="Delete Permanently"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-2" title="Sync Status">
                        {!isOnline ? (
                            <div className="group relative flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-red-500" />
                                <div className="absolute top-full mt-2 right-0 w-max px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10 pointer-events-none">
                                    Offline - Changes will sync when online
                                </div>
                            </div>
                        ) : (isSaving || updateNote.isPending) ? (
                            <Loader2 className="w-4 h-4 text-app-primary animate-spin" />
                        ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500" title="All changes saved" />
                        )}
                    </div>
                )}
            </div>

            {/* Editor Container */}
            <div className={clsx(
                "flex-1 overflow-auto px-4 py-2 max-w-5xl mx-auto w-full",
                isTrashed && "opacity-70 saturate-50 pointer-events-none"
            )}>
                {isTrashed && (
                    <div className="mx-6 my-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-500 text-sm shadow-sm animate-fade-in">
                        <Trash2 className="w-5 h-5 shrink-0" />
                        <span className="font-medium">This note is in the trash. It's read-only until restored.</span>
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
