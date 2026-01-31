import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useEffect, useCallback, useRef, useMemo } from 'react';
import type { Block, PartialBlock } from '@blocknote/core';

interface NoteEditorProps {
    content: unknown;
    onChange: (content: Block[]) => void;
    editable?: boolean;
}

// Default empty block for new notes
const getDefaultContent = (): PartialBlock[] => [
    {
        type: 'paragraph',
        content: [],
    },
];

export function NoteEditor({ content, onChange, editable = true }: NoteEditorProps) {
    const isInitialLoad = useRef(true);
    const prevContentRef = useRef<unknown>(null);

    // Safely parse initial content
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
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            return;
        }
        onChange(editor.document);
    }, [editor, onChange]);

    // Update content when prop changes (e.g., switching notes)
    useEffect(() => {
        // Skip if content hasn't actually changed
        if (prevContentRef.current === content) {
            return;
        }
        prevContentRef.current = content;

        // Only update if we have valid content and it's not the initial load
        if (content && Array.isArray(content) && content.length > 0) {
            isInitialLoad.current = true;
            try {
                // Get all current block IDs
                const currentBlockIds = editor.document.map(block => block.id);
                if (currentBlockIds.length > 0) {
                    // Replace all existing blocks with new content
                    editor.replaceBlocks(currentBlockIds, content as PartialBlock[]);
                }
            } catch (error) {
                console.error('Error updating editor content:', error);
            }
        } else if (!content || (Array.isArray(content) && content.length === 0)) {
            // Reset to default content for empty notes
            isInitialLoad.current = true;
            try {
                const currentBlockIds = editor.document.map(block => block.id);
                if (currentBlockIds.length > 0) {
                    editor.replaceBlocks(currentBlockIds, getDefaultContent());
                }
            } catch (error) {
                console.error('Error resetting editor content:', error);
            }
        }
    }, [content, editor]);

    return (
        <div className="note-editor h-full overflow-auto">
            <BlockNoteView
                editor={editor}
                editable={editable}
                onChange={handleChange}
                theme="dark"
                className="min-h-full"
            />
        </div>
    );
}
