import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';

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
    AlertCircle,
    Lock
} from 'lucide-react';

export function MainView() {
    const { selectedNoteId, selectedNotebookId, isTrashView, isPrivateSpaceUnlocked, setPinModalOpen } = useUIStore();
    const { data: note, isLoading } = useNote(selectedNoteId, selectedNotebookId);
    const updateNote = useUpdateNote();
    const restoreNote = useRestoreNote();
    const permanentlyDeleteNote = usePermanentlyDeleteNote();
    const isOnline = useOnlineStatus();

    // Local state for both title AND content to buffer edits from server overwrites
    const [title, setTitle] = useState('');
    // Store content paired with its note ID to prevent content bleeding
    const [localContentState, setLocalContentState] = useState<{ id: string, data: Block[] } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    // Track if we're in the middle of flushing pending saves - use counter for multiple rapid switches
    const pendingFlushCountRef = useRef(0);
    const [isFlushing, setIsFlushing] = useState(false);

    // Track notes that have local edits - these should NEVER be overwritten by server data
    // This is the key protection against race conditions with Firestore snapshots
    const dirtyNotesRef = useRef<Set<string>>(new Set());
    // Cache content for dirty notes so we can restore when switching back
    const dirtyContentCacheRef = useRef<Map<string, { content: Block[], title: string }>>(new Map());

    // Derived local content: only return data if it belongs to the current note
    const localContent = localContentState?.id === selectedNoteId ? localContentState.data : null;

    const lastInitializedId = useRef<string | null>(null);
    // Track whether we've synced from server for current note
    const hasSyncedRef = useRef(false);

    // Reset local state immediately when note ID changes (before data loads)
    // BUT if the new note is dirty, restore from our cache instead
    useEffect(() => {
        if (selectedNoteId !== lastInitializedId.current) {
            const cached = selectedNoteId ? dirtyContentCacheRef.current.get(selectedNoteId) : undefined;
            if (cached && selectedNoteId) {
                // Dirty note - restore from cache, do NOT sync from server
                setLocalContentState({ id: selectedNoteId, data: cached.content });
                setTitle(cached.title);
                hasSyncedRef.current = true; // Mark as synced to prevent server overwrite
            } else {
                // Clean note - clear state and wait for server sync
                setLocalContentState(null);
                setTitle('');
                hasSyncedRef.current = false;
            }
            lastInitializedId.current = selectedNoteId;
        }
    }, [selectedNoteId]);

    // Sync local state from server when note data arrives
    // IMPORTANT: 
    // 1. Must verify note.id matches selectedNoteId to avoid syncing stale data
    // 2. Must wait for ALL pending flushes to complete first
    // 3. NEVER sync if the note has local edits (dirty) - our local state is the source of truth
    useEffect(() => {
        const isDirty = selectedNoteId ? dirtyNotesRef.current.has(selectedNoteId) : false;
        if (note && note.id === selectedNoteId && !hasSyncedRef.current && !isFlushing && !isDirty) {
            setTitle(note.title);
            setLocalContentState({ id: note.id, data: note.content as Block[] ?? [] });
            hasSyncedRef.current = true;
        }
    }, [note, selectedNoteId, isFlushing]);

    // Use ref for updateNote to stabilize saveContent callback
    // This prevents debouncedSaveContent from being recreated when updateNote changes
    const updateNoteRef = useRef(updateNote);
    updateNoteRef.current = updateNote;

    // Save function that captures correct note ID at call time
    // Uses ref to avoid dependency on updateNote, keeping this stable
    const saveContent = useCallback(
        async (content: Block[], noteId: string, notebookId: string) => {
            // Guard against saving to wrong note
            if (!noteId || !notebookId) return;

            setIsSaving(true);
            try {
                await updateNoteRef.current.mutateAsync({ id: noteId, notebookId, content });
            } finally {
                setIsSaving(false);
            }
        },
        [] // No dependencies - uses ref instead
    );

    const debouncedSaveContent = useDebouncedCallback(saveContent, 1500);

    const debouncedSaveTitle = useDebouncedCallback(
        async (newTitle: string, noteId: string, notebookId: string) => {
            if (!noteId || !notebookId) return;
            setIsSaving(true);
            try {
                await updateNoteRef.current.mutateAsync({ id: noteId, notebookId, title: newTitle });
            } finally {
                setIsSaving(false);
            }
        },
        1000
    );

    // Track previous note ID to flush when it changes
    const prevNoteIdRef = useRef<string | null>(null);

    // Flush both content and title when note changes
    // CRITICAL: Use counter to track ALL in-flight flushes, not just the most recent one
    useLayoutEffect(() => {
        const prevId = prevNoteIdRef.current;
        if (prevId !== null && prevId !== selectedNoteId) {
            // Increment counter and set flushing state
            pendingFlushCountRef.current += 1;
            setIsFlushing(true);

            // Perform async flush
            (async () => {
                try {
                    await Promise.all([
                        debouncedSaveContent.flush(),
                        debouncedSaveTitle.flush()
                    ]);
                } finally {
                    // Decrement counter - only clear isFlushing when ALL flushes complete
                    pendingFlushCountRef.current -= 1;
                    if (pendingFlushCountRef.current === 0) {
                        setIsFlushing(false);
                    }
                }
            })();
        }
        prevNoteIdRef.current = selectedNoteId;
    }, [selectedNoteId, debouncedSaveContent, debouncedSaveTitle]);

    const handleTitleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newTitle = e.target.value;
            setTitle(newTitle);
            // Capture current IDs to prevent stale closure issues
            if (selectedNoteId && selectedNotebookId) {
                // Mark this note as having local edits
                dirtyNotesRef.current.add(selectedNoteId);
                // Update the cache with the new title (preserve existing content)
                const existing = dirtyContentCacheRef.current.get(selectedNoteId);
                dirtyContentCacheRef.current.set(selectedNoteId, {
                    content: existing?.content ?? localContentState?.data ?? [],
                    title: newTitle
                });
                debouncedSaveTitle(newTitle, selectedNoteId, selectedNotebookId);
            }
        },
        [selectedNoteId, selectedNotebookId, debouncedSaveTitle, localContentState]
    );

    const handleContentChange = useCallback(
        (content: Block[], sourceNoteId: string) => {
            // CRITICAL: Prevent race conditions where a previous note's editor fires an update
            // after the selection has changed. This was causing "Content Bleeding".
            if (sourceNoteId !== selectedNoteId) {
                console.warn(`[MainView] Race condition avoided: ignored update from ${sourceNoteId} while on ${selectedNoteId}`);
                return;
            }

            // Update local state immediately for responsiveness
            if (selectedNoteId) {
                setLocalContentState({ id: selectedNoteId, data: content });
                // Mark this note as having local edits - it should NEVER be overwritten by server data
                dirtyNotesRef.current.add(selectedNoteId);
                // Update the cache with the new content (preserve existing title)
                const existing = dirtyContentCacheRef.current.get(selectedNoteId);
                dirtyContentCacheRef.current.set(selectedNoteId, {
                    content: content,
                    title: existing?.title ?? title
                });
            }

            // Capture current IDs to prevent stale closure issues
            if (selectedNoteId && selectedNotebookId) {
                debouncedSaveContent(content, selectedNoteId, selectedNotebookId);
            }
        },
        [selectedNoteId, selectedNotebookId, debouncedSaveContent, title]
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

    if (note?.is_private && !isPrivateSpaceUnlocked) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-app-bg text-center gap-4 animate-fade-in shadow-inner border-l border-app-border">
                <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center text-purple-500 mb-2 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                    <Lock className="w-10 h-10" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-indigo-500 bg-clip-text text-transparent">
                        Private Note Locked
                    </h2>
                    <p className="text-app-muted text-[15px] mt-2 max-w-sm mx-auto">
                        This note is secure in your Private Space. Unlock the space to view or edit this note.
                    </p>
                </div>
                <button
                    onClick={() => setPinModalOpen(true)}
                    className="mt-6 px-8 py-3 bg-app-surface border border-purple-500/30 hover:border-purple-500 hover:bg-purple-500/5 text-purple-400 font-medium rounded-xl transition-all shadow-lg shadow-purple-500/5 hover:shadow-purple-500/20 active:scale-95 flex items-center gap-2"
                >
                    <Lock className="w-4 h-4" />
                    Enter PIN to Unlock
                </button>
            </div>
        );
    }

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
                                <div className="absolute top-full mt-2 right-0 w-max px-3 py-1.5 bg-red-700 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10 pointer-events-none">
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
                {localContent !== null && selectedNoteId ? (
                    <NoteEditor
                        key={selectedNoteId}
                        noteId={selectedNoteId}
                        content={localContent}
                        onChange={handleContentChange}
                        editable={!isTrashed}
                    />
                ) : (
                    <div className="flex items-center justify-center h-32">
                        <Loader2 className="w-6 h-6 animate-spin text-app-muted" />
                    </div>
                )}
            </div>
        </div>
    );
}
