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
            editor?.commands.setContent(noteData[0].note);
        }
    }, [noteData, editor])

    if (!editor) {
        return null
    }

    return (
        <section className='flex h-full flex-col overflow-hidden border-l border-border bg-background'>
            <div className="z-10 shrink-0 border-b border-border bg-background">
                <EditorExtension editor={editor} />
            </div>
            <div className="custom-scrollbar flex-1 overflow-y-auto bg-background">
                <EditorContent editor={editor} />
            </div>
        </section>
    )
}
