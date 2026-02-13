'use client'
import { EditorExtension } from './Editor-extension'
import { useEditor, EditorContent } from '@tiptap/react'
import { useApiQuery } from '@/lib/hooks'
import { useParams } from 'next/navigation'
import { useEffect } from 'react'
import { Editor } from '@tiptap/react'

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
        <div className='border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col h-full'>
            {/* Toolbar */}
            <div className="shrink-0 z-10 sticky top-0 bg-white">
                <EditorExtension editor={editor} />
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                <EditorContent editor={editor} />
            </div>
        </div>
    )
}
