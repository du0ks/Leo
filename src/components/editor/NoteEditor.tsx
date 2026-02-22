import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCallback, useRef, useMemo, useEffect } from 'react';
import type { Block, PartialBlock } from '@blocknote/core';
import { useUIStore } from '../../stores/uiStore';

interface NoteEditorProps {
    noteId: string;
    content: unknown;
    onChange: (content: Block[], noteId: string) => void;
    editable?: boolean;
}

// Default empty block for new notes
const getDefaultContent = (): PartialBlock[] => [
    {
        type: 'paragraph',
        content: [],
    },
];

export function NoteEditor({ noteId, content, onChange, editable = true }: NoteEditorProps) {
    const isInitialLoad = useRef(true);
    const { darkMode } = useUIStore();

    // Safely parse initial content.
    // We rely on the parent component changing the 'key' prop to re-initialize this component
    // when the user switches notes. This prevents the "jumping cursor" issue because
    // we don't sync 'content' prop changes into the editor via useEffect.
    const initialContent = useMemo((): PartialBlock[] => {
        if (content && Array.isArray(content) && content.length > 0) {
            return content as PartialBlock[];
        }
        return getDefaultContent();
    }, []); // Only compute on mount

    const editor = useCreateBlockNote({
        initialContent,
    });

    // Handle content changes from editor
    const handleChange = useCallback(() => {
        // Skip the first change triggered by initialization
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            return;
        }
        onChange(editor.document, noteId);
    }, [editor, onChange, noteId]);

    // Attach listener directly to editor to catch paste events
    useEffect(() => {
        if (editor && typeof editor.onChange === 'function') {
            const unsubscribe = editor.onChange(handleChange);
            return () => {
                unsubscribe();
            };
        }
    }, [editor, handleChange]);

    // Intercept Backspace to prevent outdenting empty lines from toggle lists
    const handleKeyDownCapture = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!editor || e.key !== 'Backspace') return;

        try {
            const cursor = editor.getTextCursorPosition();
            if (!cursor || !cursor.block) return;

            const { block, prevBlock } = cursor;

            const b = block as any;
            const isEmptyContent = !b.content ||
                (Array.isArray(b.content) && b.content.length === 0) ||
                (typeof b.content === 'string' && b.content === '');
            const hasNoChildren = !b.children || b.children.length === 0;
            const isEmpty = isEmptyContent && hasNoChildren;

            if (!isEmpty) return;

            // Check if inside a toggle block
            const parent = editor.getParentBlock(block);
            if (parent && parent.type === 'toggleListItem') {
                e.preventDefault();
                e.stopPropagation();

                // Focus previous block so we don't lose focus
                if (prevBlock) {
                    editor.setTextCursorPosition(prevBlock, 'end');
                } else {
                    editor.setTextCursorPosition(parent, 'start');
                }

                editor.removeBlocks([block]);
            }
        } catch (err) {
            // getTextCursorPosition throws if multiple blocks are selected or no text cursor
        }
    }, [editor]);

    return (
        <div className="note-editor h-full overflow-auto" onKeyDownCapture={handleKeyDownCapture}>
            <BlockNoteView
                editor={editor}
                editable={editable}
                onChange={handleChange}
                theme={darkMode ? "dark" : "light"}
                className="min-h-full"
            />
        </div>
    );
}
