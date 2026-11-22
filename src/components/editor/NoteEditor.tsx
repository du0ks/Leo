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
    const darkMode = useUIStore((s) => s.darkMode);

    // Initial content is only read on mount. The parent changes the `key` prop
    // to re-initialize the editor (note switch or newer remote version), which
    // avoids cursor jumps from syncing props into a live editor.
    const initialContent = useMemo((): PartialBlock[] => {
        if (content && Array.isArray(content) && content.length > 0) {
            return content as PartialBlock[];
        }
        return getDefaultContent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const editor = useCreateBlockNote({
        initialContent,
    });

    // BlockNote may emit normalization transactions right after mount. Saving
    // those would bump the note (and could overwrite newer content from another
    // device), so ignore changes until the document really differs from what
    // was loaded. Only the first few events pay for the comparison.
    const initialJsonRef = useRef<string | null>(null);
    const hasUserChangesRef = useRef(false);
    useEffect(() => {
        initialJsonRef.current = JSON.stringify(editor.document);
    }, [editor]);

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const editableRef = useRef(editable);
    editableRef.current = editable;

    useEffect(() => {
        return editor.onChange(() => {
            if (!editableRef.current) return;
            if (!hasUserChangesRef.current) {
                if (JSON.stringify(editor.document) === initialJsonRef.current) return;
                hasUserChangesRef.current = true;
            }
            onChangeRef.current(editor.document, noteId);
        });
    }, [editor, noteId]);

    // Intercept Backspace & Enter
    const handleKeyDownCapture = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!editor) return;

        if (e.key === 'Backspace') {
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
            return;
        }

        if (e.key === 'Enter') {
            try {
                const cursor = editor.getTextCursorPosition();
                if (!cursor || !cursor.block) return;
                const { block } = cursor;

                // When pressing Enter at the end of a toggle list with children,
                // prevent BlockNote from stealing the children into the new block.
                // We create a new empty toggle block below instead.
                if (block.type === 'toggleListItem' && block.children && block.children.length > 0) {
                    const tiptap = (editor as any)._tiptapEditor;
                    if (tiptap && tiptap.state) {
                        const { selection } = tiptap.state;
                        if (selection.empty) {
                            const { $head } = selection;
                            // Check if cursor is at the end of the text node
                            const isAtEnd = $head.parentOffset === $head.parent.content.size;

                            if (isAtEnd) {
                                e.preventDefault();
                                e.stopPropagation();

                                const inserted = editor.insertBlocks(
                                    [{ type: 'toggleListItem', content: [] }],
                                    block,
                                    'after'
                                );
                                if (inserted && inserted.length > 0) {
                                    editor.setTextCursorPosition(inserted[0], 'start');
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                // ignore
            }
        }
    }, [editor]);

    return (
        <div className="note-editor h-full overflow-auto" onKeyDownCapture={handleKeyDownCapture}>
            <BlockNoteView
                editor={editor}
                editable={editable}
                theme={darkMode ? "dark" : "light"}
                className="min-h-full"
            />
        </div>
    );
}
