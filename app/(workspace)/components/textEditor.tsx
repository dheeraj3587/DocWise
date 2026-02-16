'use client'
import { EditorExtension } from './Editor-extension'
import { useApiQuery } from '@/lib/hooks'
import { useParams } from 'next/navigation'
import { useEffect } from 'react'
import { Editor, EditorContent } from '@tiptap/react'

interface NoteData {
    id: number
    fileId: string
    note: string
    createdBy?: string
    updatedAt?: string
}

interface EditorExtensionProps {
    editor: Editor | null
}

export const TextEditor = ({editor}: EditorExtensionProps) => {

    const { fileId } = useParams();
    const { data: noteData } = useApiQuery<NoteData[]>(
        fileId ? `/api/notes/${fileId}` : null,
        [fileId],
    );

    useEffect(() => {
        if (Array.isArray(noteData) && noteData.length > 0 && noteData[0].note) {
            editor && editor.commands.setContent(noteData[0].note);
        }
    }, [noteData, editor])

    if (!editor) {
        return null
    }

    return (
        <div className='glass rounded-xl overflow-hidden flex flex-col h-full'>
            <div className="shrink-0 z-10 sticky top-0">
                <EditorExtension editor={editor} />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar surface-1">
                <EditorContent editor={editor} />
            </div>
        </div>
    )
}
