import { useState } from 'react';
import { FolderPlus, Book, Trash2, Edit2, Check, X, Loader2, Trash } from 'lucide-react';
import {
    useNotebooks,
    useCreateNotebook,
    useSoftDeleteNotebook,
    useUpdateNotebook
} from '../../hooks/useNotebooks';
import { useUIStore } from '../../stores/uiStore';
import { useAuth } from '../../hooks/useAuth';
import clsx from 'clsx';

export function Sidebar() {
    const { user } = useAuth();
    const { data: notebooks, isLoading } = useNotebooks();
    const createNotebook = useCreateNotebook();
    const softDeleteNotebook = useSoftDeleteNotebook();
    const updateNotebook = useUpdateNotebook();

    const { selectedNotebookId, selectNotebook, isTrashView, setTrashView } = useUIStore();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');

    const handleCreate = async () => {
        if (!user || !newTitle.trim()) return;

        try {
            const notebook = await createNotebook.mutateAsync({
                user_id: user.id,
                title: newTitle.trim(),
            });
            selectNotebook(notebook.id);
            setNewTitle('');
            setIsCreating(false);
        } catch (error) {
            console.error('Failed to create notebook:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Move this notebook to trash? All its notes will also be trashed.')) {
            await softDeleteNotebook.mutateAsync(id);
            if (selectedNotebookId === id) {
                selectNotebook(null);
            }
        }
    };

    const handleRename = async (id: string) => {
        if (!editTitle.trim()) {
            setEditingId(null);
            return;
        }

        await updateNotebook.mutateAsync({ id, title: editTitle.trim() });
        setEditingId(null);
    };

    const startEditing = (id: string, title: string) => {
        setEditingId(id);
        setEditTitle(title);
    };

    return (
        <div className="w-64 h-full bg-app-surface border-r border-app-border flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-app-border">
                <h2 className="text-lg font-semibold text-app-text">Notebooks</h2>
            </div>

            {/* Main Scrollable Area */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col">
                {/* Notebooks Section */}
                <div className="flex-1">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-app-muted" />
                        </div>
                    ) : notebooks?.length === 0 ? (
                        <p className="text-app-muted text-sm text-center py-8">
                            No notebooks yet
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {notebooks?.map((notebook) => (
                                <li key={notebook.id}>
                                    {editingId === notebook.id ? (
                                        <div className="flex items-center gap-1 p-2">
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRename(notebook.id);
                                                    if (e.key === 'Escape') setEditingId(null);
                                                }}
                                                className="flex-1 px-2 py-1 rounded bg-app-bg border border-app-border text-app-text text-sm focus:outline-none focus:ring-2 focus:ring-app-primary"
                                                autoFocus
                                            />
                                            <button
                                                onClick={() => handleRename(notebook.id)}
                                                className="p-1 hover:bg-app-accent-bg rounded"
                                            >
                                                <Check className="w-4 h-4 text-green-500" />
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="p-1 hover:bg-app-accent-bg rounded"
                                            >
                                                <X className="w-4 h-4 text-red-500" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => selectNotebook(notebook.id)}
                                            className={clsx(
                                                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left group transition-all cursor-pointer',
                                                selectedNotebookId === notebook.id
                                                    ? 'bg-app-accent-bg text-app-primary font-medium'
                                                    : 'text-app-text hover:bg-app-accent-bg'
                                            )}
                                        >
                                            <Book className="w-4 h-4 shrink-0" />
                                            <span className="flex-1 truncate text-sm">{notebook.title}</span>
                                            <div className="hidden group-hover:flex items-center gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        startEditing(notebook.id, notebook.title);
                                                    }}
                                                    className="p-1 hover:bg-app-bg rounded"
                                                >
                                                    <Edit2 className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(notebook.id);
                                                    }}
                                                    className="p-1 hover:bg-app-bg rounded text-red-500/80 hover:text-red-500"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* New Notebook Input */}
                    {isCreating && (
                        <div className="mt-2 flex items-center gap-1 p-2">
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreate();
                                    if (e.key === 'Escape') setIsCreating(false);
                                }}
                                placeholder="Notebook name..."
                                className="flex-1 px-2 py-1 rounded bg-app-bg border border-app-border text-app-text text-sm placeholder-app-muted focus:outline-none focus:ring-2 focus:ring-app-primary"
                                autoFocus
                            />
                            <button onClick={handleCreate} className="p-1 hover:bg-app-accent-bg rounded">
                                <Check className="w-4 h-4 text-green-500" />
                            </button>
                            <button onClick={() => setIsCreating(false)} className="p-1 hover:bg-app-accent-bg rounded">
                                <X className="w-4 h-4 text-red-500" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Trash Section */}
                <div className="mt-auto pt-4 border-t border-app-border/50">
                    <button
                        onClick={() => setTrashView(true)}
                        className={clsx(
                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all',
                            isTrashView
                                ? 'bg-red-500/10 text-red-500 font-medium'
                                : 'text-app-text hover:bg-app-accent-bg'
                        )}
                    >
                        <Trash className="w-4 h-4 shrink-0" />
                        <span className="flex-1 truncate text-sm">Trash</span>
                    </button>
                </div>
            </div>

            {/* Footer - New Notebook Button */}
            <div className="p-3 border-t border-app-border bg-app-surface/50">
                <button
                    onClick={() => setIsCreating(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-app-primary text-white text-sm font-medium hover:bg-app-primary-hover transition-colors shadow-sm"
                >
                    <FolderPlus className="w-4 h-4" />
                    New Notebook
                </button>
            </div>
        </div>
    );
}
