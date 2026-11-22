import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';

import { useNote, useRestoreNote, usePermanentlyDeleteNote, saveNoteFields } from '../../hooks/useNotes';
import { useUIStore } from '../../stores/uiStore';
import type { Block } from '@blocknote/core';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { registerFlusher, flushPendingSaves } from '../../lib/pendingSaves';
import { stableStringify } from '../../lib/firestoreUtils';
import clsx from 'clsx';
import { DeleteButton } from '../ui/rareui/LazyDeleteButton';
import { Loader2, RotateCcw, Trash2, AlertCircle, CloudOff } from 'lucide-react';

// The editor (BlockNote + ProseMirror) is the heaviest part of the bundle;
// load it on demand so the login screen and sidebar appear faster.
const NoteEditor = lazy(() => import('../editor/NoteEditor').then((m) => ({ default: m.NoteEditor })));

const EditorSpinner = () => (
    <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-app-muted" />
    </div>
);

const CONTENT_SAVE_DELAY_MS = 1000;
const TITLE_SAVE_DELAY_MS = 600;

interface EditorState {
    noteId: string;
    /** Bumped to remount the editor when a newer remote version is applied. */
    version: number;
    content: unknown;
}

export function MainView() {
    const selectedNoteId = useUIStore((s) => s.selectedNoteId);
    const selectedNotebookId = useUIStore((s) => s.selectedNotebookId);
    const isTrashView = useUIStore((s) => s.isTrashView);
    const selectNote = useUIStore((s) => s.selectNote);

    const { data: note, isLoading } = useNote(selectedNoteId, selectedNotebookId);
    const restoreNote = useRestoreNote();
    const permanentlyDeleteNote = usePermanentlyDeleteNote();
    const isOnline = useOnlineStatus();

    const [title, setTitle] = useState('');
    const [editorState, setEditorState] = useState<EditorState | null>(null);
    const [inflightWrites, setInflightWrites] = useState(0);
    const [saveError, setSaveError] = useState<string | null>(null);
    /** True while edits are waiting for the debounce timer (drives the indicator). */
    const [hasBufferedEdits, setHasBufferedEdits] = useState(false);

    // Refs so callbacks stay stable (the editor subscribes to them)
    const selectedNoteIdRef = useRef(selectedNoteId);
    const selectedNotebookIdRef = useRef(selectedNotebookId);
    selectedNoteIdRef.current = selectedNoteId;
    selectedNotebookIdRef.current = selectedNotebookId;

    /** Note currently loaded into the editor. */
    const loadedNoteIdRef = useRef<string | null>(null);
    /** Order-independent JSON of the content we last loaded or saved. */
    const lastContentJsonRef = useRef<string | null>(null);
    const titleRef = useRef(title);
    titleRef.current = title;
    const saveErrorRef = useRef(saveError);
    saveErrorRef.current = saveError;

    // --- Writing -----------------------------------------------------------

    const runWrite = useCallback(
        (noteId: string, notebookId: string, fields: { title?: string; content?: unknown }) => {
            setInflightWrites((n) => n + 1);
            saveNoteFields(notebookId, noteId, fields)
                .then(() => setSaveError(null))
                .catch((err: unknown) => {
                    console.error('[MainView] Failed to save note:', err);
                    setSaveError(err instanceof Error ? err.message : 'Failed to save changes.');
                })
                .finally(() => setInflightWrites((n) => n - 1));
        },
        []
    );

    const saveContent = useDebouncedCallback((content: Block[], noteId: string, notebookId: string) => {
        if (noteId === loadedNoteIdRef.current) {
            lastContentJsonRef.current = stableStringify(content);
        }
        if (!saveTitle.hasPending()) setHasBufferedEdits(false);
        runWrite(noteId, notebookId, { content });
    }, CONTENT_SAVE_DELAY_MS);

    const saveTitle = useDebouncedCallback((newTitle: string, noteId: string, notebookId: string) => {
        if (!saveContent.hasPending()) setHasBufferedEdits(false);
        runWrite(noteId, notebookId, { title: newTitle });
    }, TITLE_SAVE_DELAY_MS);

    // Let the rest of the app (move, sign-out, unload) flush our buffered edits
    useEffect(
        () =>
            registerFlusher(() => {
                saveContent.flush();
                saveTitle.flush();
            }),
        [saveContent, saveTitle]
    );

    // Never lose the last keystrokes when the tab is closed or backgrounded
    useEffect(() => {
        const onHide = () => {
            if (document.visibilityState === 'hidden') flushPendingSaves();
        };
        window.addEventListener('pagehide', flushPendingSaves);
        document.addEventListener('visibilitychange', onHide);
        return () => {
            window.removeEventListener('pagehide', flushPendingSaves);
            document.removeEventListener('visibilitychange', onHide);
        };
    }, []);

    // Flush the previous note's edits when switching notes (args carry their own IDs)
    useEffect(() => {
        return () => {
            saveContent.flush();
            saveTitle.flush();
        };
    }, [selectedNoteId, saveContent, saveTitle]);

    // --- Loading / remote sync ----------------------------------------------

    useEffect(() => {
        if (!selectedNoteId) {
            loadedNoteIdRef.current = null;
            setEditorState(null);
            return;
        }
        if (!note || note.id !== selectedNoteId) return;

        if (loadedNoteIdRef.current !== note.id) {
            // First load of this note. The cache already includes our own
            // pending local writes, so this is always our latest version.
            loadedNoteIdRef.current = note.id;
            lastContentJsonRef.current = stableStringify(note.content ?? []);
            setEditorState((prev) => ({ noteId: note.id, version: (prev?.version ?? 0) + 1, content: note.content }));
            setTitle(note.title ?? '');
            setSaveError(null);
            return;
        }

        // Same note, new snapshot. Only apply changes that came from elsewhere
        // (another device/tab) and only while the user has nothing buffered.
        // After a failed save Firestore rolls back the local write; don't let
        // that rollback wipe what the user typed — keep their text on screen.
        if (note.has_pending_writes || saveErrorRef.current) return;

        if (!saveTitle.hasPending() && (note.title ?? '') !== titleRef.current) {
            setTitle(note.title ?? '');
        }

        if (!saveContent.hasPending()) {
            const json = stableStringify(note.content ?? []);
            if (json !== lastContentJsonRef.current) {
                lastContentJsonRef.current = json;
                setEditorState((prev) => ({ noteId: note.id, version: (prev?.version ?? 0) + 1, content: note.content }));
            }
        }
    }, [note, selectedNoteId, saveContent, saveTitle]);

    // --- Handlers -------------------------------------------------------------

    const handleTitleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newTitle = e.target.value;
            setTitle(newTitle);
            const noteId = selectedNoteIdRef.current;
            const notebookId = selectedNotebookIdRef.current;
            if (noteId && notebookId) {
                setHasBufferedEdits(true);
                saveTitle(newTitle, noteId, notebookId);
            }
        },
        [saveTitle]
    );

    const handleContentChange = useCallback(
        (content: Block[], sourceNoteId: string) => {
            // Ignore late events from a previous note's editor
            if (sourceNoteId !== selectedNoteIdRef.current) return;
            const notebookId = selectedNotebookIdRef.current;
            if (notebookId) {
                setHasBufferedEdits(true);
                saveContent(content, sourceNoteId, notebookId);
            }
        },
        [saveContent]
    );

    const handleRestore = async () => {
        if (!note) return;
        await restoreNote.mutateAsync({ id: note.id, notebookId: note.notebook_id });
        selectNote(note.id, note.notebook_id, false);
    };

    const handlePermanentDelete = async () => {
        if (!note) return;
        selectNote(null, null);
        try {
            await permanentlyDeleteNote.mutateAsync({ id: note.id, notebookId: note.notebook_id });
        } catch (err) {
            console.error('Failed to delete note:', err);
            window.alert('Could not delete note. Please try again.');
        }
    };

    // --- Render ---------------------------------------------------------------

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

    if (!note) {
        return (
            <div className="flex-1 flex items-center justify-center bg-app-bg">
                <p className="text-app-muted">Note not found</p>
            </div>
        );
    }

    const isTrashed = !!note.deleted_at;
    const isSyncing = inflightWrites > 0 || hasBufferedEdits;

    return (
        <div className="flex-1 flex flex-col bg-app-bg overflow-hidden transition-all duration-300">
            {/* Title Bar */}
            <div className="flex items-center gap-3 px-8 py-6 border-b border-app-border bg-app-surface/20">
                <input
                    type="text"
                    value={title}
                    onChange={handleTitleChange}
                    placeholder="Untitled Note"
                    maxLength={200}
                    readOnly={isTrashed}
                    className={clsx(
                        "flex-1 min-w-0 text-3xl font-bold bg-transparent text-app-text placeholder-app-muted focus:outline-none transition-opacity",
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
                        <DeleteButton
                            size="md"
                            label="Delete permanently"
                            confirmLabel="Permanently delete this note"
                            className="text-red-500 hover:bg-red-500/10"
                            onConfirm={handlePermanentDelete}
                        />
                    </div>
                ) : (
                    <SyncIndicator error={saveError} isOnline={isOnline} isSyncing={isSyncing} />
                )}
            </div>

            {saveError && !isTrashed && (
                <div className="mx-8 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Your latest changes could not be saved: {saveError}</span>
                </div>
            )}

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
                {editorState && editorState.noteId === selectedNoteId ? (
                    <Suspense fallback={<EditorSpinner />}>
                        <NoteEditor
                            key={`${editorState.noteId}:${editorState.version}`}
                            noteId={editorState.noteId}
                            content={editorState.content}
                            onChange={handleContentChange}
                            editable={!isTrashed}
                        />
                    </Suspense>
                ) : (
                    <EditorSpinner />
                )}
            </div>
        </div>
    );
}

function SyncIndicator({ error, isOnline, isSyncing }: { error: string | null; isOnline: boolean; isSyncing: boolean }) {
    let icon: React.ReactNode;
    let label: string;

    if (error) {
        icon = <AlertCircle className="w-5 h-5 text-red-500" />;
        label = 'Save failed';
    } else if (!isOnline) {
        icon = <CloudOff className="w-5 h-5 text-amber-500" />;
        label = 'Offline — changes are saved on this device and will sync when online';
    } else if (isSyncing) {
        icon = <Loader2 className="w-4 h-4 text-app-primary animate-spin" />;
        label = 'Saving…';
    } else {
        icon = <div className="w-2.5 h-2.5 rounded-full bg-green-500" />;
        label = 'All changes saved';
    }

    return (
        <div className="group relative flex items-center justify-center px-2" role="status" aria-label={label}>
            {icon}
            <div className="absolute top-full mt-2 right-0 w-max max-w-xs px-3 py-1.5 bg-app-surface border border-app-border text-app-text text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10 pointer-events-none">
                {label}
            </div>
        </div>
    );
}
