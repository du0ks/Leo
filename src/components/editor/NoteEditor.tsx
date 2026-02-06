import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useCallback, useRef, useMemo } from 'react';
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

    return (
        <div className="note-editor h-full overflow-auto">
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
