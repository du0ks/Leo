import { useState, useCallback, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { useNote, useUpdateNote } from '../../hooks/useNotes';
import { useUIStore } from '../../stores/uiStore';
import { NoteEditor } from '../editor/NoteEditor';
import type { Block } from '@blocknote/core';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';

export function MainView() {
    const { selectedNoteId } = useUIStore();
    const { data: note, isLoading } = useNote(selectedNoteId);
    const updateNote = useUpdateNote();

    const [title, setTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Sync title with note data
    useEffect(() => {
        if (note) {
            setTitle(note.title);
        }
    }, [note]);

    // Debounced save for content
    const debouncedSaveContent = useDebouncedCallback(
        async (content: Block[]) => {
            if (!selectedNoteId) return;
            setIsSaving(true);
            try {
                await updateNote.mutateAsync({ id: selectedNoteId, content });
            } finally {
                setIsSaving(false);
            }
        },
        1000
    );

    // Debounced save for title
    const debouncedSaveTitle = useDebouncedCallback(
        async (newTitle: string) => {
            if (!selectedNoteId) return;
            setIsSaving(true);
            try {
                await updateNote.mutateAsync({ id: selectedNoteId, title: newTitle });
            } finally {
                setIsSaving(false);
            }
        },
        500
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

    if (!selectedNoteId) {
        return (
            <div className="flex-1 flex items-center justify-center bg-dark-bg">
                <div className="text-center">
                    <p className="text-dark-muted text-lg">Select a note to start editing</p>
                    <p className="text-dark-muted/50 text-sm mt-2">
                        Or create a new one from the sidebar
                    </p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-dark-bg">
                <Loader2 className="w-8 h-8 animate-spin text-dark-muted" />
            </div>
        );
    }

    if (!note) {
        return (
            <div className="flex-1 flex items-center justify-center bg-dark-bg">
                <p className="text-dark-muted">Note not found</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-dark-bg overflow-hidden">
            {/* Title Bar */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-dark-border">
                <input
                    type="text"
                    value={title}
                    onChange={handleTitleChange}
                    placeholder="Untitled Note"
                    className="flex-1 text-2xl font-semibold bg-transparent text-dark-text placeholder-dark-muted focus:outline-none"
                />
                <div className="flex items-center gap-2 text-dark-muted">
                    {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Save className="w-4 h-4" />
                    )}
                    <span className="text-xs">{isSaving ? 'Saving...' : 'Saved'}</span>
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-auto px-4">
                <NoteEditor content={note.content} onChange={handleContentChange} />
            </div>
        </div>
    );
}
