import { useState } from 'react';
import { FolderPlus, Book, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react';
import { useNotebooks, useCreateNotebook, useDeleteNotebook, useUpdateNotebook } from '../../hooks/useNotebooks';
import { useUIStore } from '../../stores/uiStore';
import { useAuth } from '../../hooks/useAuth';
import clsx from 'clsx';

export function Sidebar() {
    const { user } = useAuth();
    const { data: notebooks, isLoading } = useNotebooks();
    const createNotebook = useCreateNotebook();
    const deleteNotebook = useDeleteNotebook();
    const updateNotebook = useUpdateNotebook();

    const { selectedNotebookId, selectNotebook } = useUIStore();

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
        if (confirm('Delete this notebook and all its notes?')) {
            await deleteNotebook.mutateAsync(id);
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
        <div className="w-64 h-full bg-dark-surface border-r border-dark-border flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-dark-border">
                <h2 className="text-lg font-semibold text-dark-text">Notebooks</h2>
            </div>

            {/* Notebook List */}
            <div className="flex-1 overflow-y-auto p-2">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-dark-muted" />
                    </div>
                ) : notebooks?.length === 0 ? (
                    <p className="text-dark-muted text-sm text-center py-8">
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
                                            className="flex-1 px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            autoFocus
                                        />
                                        <button
                                            onClick={() => handleRename(notebook.id)}
                                            className="p-1 hover:bg-dark-border rounded"
                                        >
                                            <Check className="w-4 h-4 text-green-400" />
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="p-1 hover:bg-dark-border rounded"
                                        >
                                            <X className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => selectNotebook(notebook.id)}
                                        className={clsx(
                                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left group transition-colors',
                                            selectedNotebookId === notebook.id
                                                ? 'bg-blue-600/20 text-blue-400'
                                                : 'text-dark-text hover:bg-dark-border'
                                        )}
                                    >
                                        <Book className="w-4 h-4 shrink-0" />
                                        <span className="flex-1 truncate text-sm">{notebook.title}</span>
                                        <div className="hidden group-hover:flex items-center gap-1">
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    startEditing(notebook.id, notebook.title);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.stopPropagation();
                                                        startEditing(notebook.id, notebook.title);
                                                    }
                                                }}
                                                className="p-1 hover:bg-dark-bg rounded cursor-pointer"
                                            >
                                                <Edit2 className="w-3 h-3" />
                                            </span>
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(notebook.id);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.stopPropagation();
                                                        handleDelete(notebook.id);
                                                    }
                                                }}
                                                className="p-1 hover:bg-dark-bg rounded text-red-400 cursor-pointer"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </span>
                                        </div>
                                    </button>
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
                            className="flex-1 px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text text-sm placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                        />
                        <button onClick={handleCreate} className="p-1 hover:bg-dark-border rounded">
                            <Check className="w-4 h-4 text-green-400" />
                        </button>
                        <button onClick={() => setIsCreating(false)} className="p-1 hover:bg-dark-border rounded">
                            <X className="w-4 h-4 text-red-400" />
                        </button>
                    </div>
                )}
            </div>

            {/* Footer - New Notebook Button */}
            <div className="p-3 border-t border-dark-border">
                <button
                    onClick={() => setIsCreating(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-dark-border hover:bg-dark-muted/20 text-dark-text text-sm transition-colors"
                >
                    <FolderPlus className="w-4 h-4" />
                    New Notebook
                </button>
            </div>
        </div>
    );
}
