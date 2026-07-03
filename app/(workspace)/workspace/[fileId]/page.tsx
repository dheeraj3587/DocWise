'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useApiQuery } from '@/lib/hooks'
import { FileRecord } from '@/lib/api-client'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import { useEditor } from '@tiptap/react'
import { WorkspaceHeader } from '../../components/workspace-header'
import { PdfViewer } from '../../components/PdfViewer'
import { MediaPlayer } from '../../components/MediaPlayer'
import { TextEditor } from '../../components/textEditor'
import { ChatMessage, ChatPanel } from '../../components/ChatPanel'
import { WorkspaceOutline } from '../../components/workspace-outline'
import { WorkspaceSkeleton } from '@/app/skeleton/workspace-skeleton'

export type LeftPanelView = 'document' | 'chat'

const Workspace = () => {
  const { fileId } = useParams()
  const [leftPanel, setLeftPanel] = useState<LeftPanelView>('document')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [sidePanelOpen, setSidePanelOpen] = useState(true)

  const { data: fileData, isLoading } = useApiQuery<FileRecord>(
    fileId ? `/api/files/${fileId}` : null,
    [fileId],
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false,
        link: false,
      }),
      Placeholder.configure({
        placeholder: 'Start writing your amazing document...',
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Image,
      Highlight,
    ],
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[500px] px-8 py-6',
      },
    },
    content: '',
    immediatelyRender: false,
  })

  if (!fileId) {
    return <div>file not found</div>
  }

  if (isLoading) {
    return <WorkspaceSkeleton />
  }

  if (!fileData) {
    return <div>File not found</div>
  }

  const isMedia = fileData.fileType === 'audio' || fileData.fileType === 'video'

  return (
    <div className="dark flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceHeader
        editor={editor}
        fileName={fileData.fileName}
        chatMessages={chatMessages}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={() => setSidePanelOpen((open) => !open)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {outlineOpen ? (
          <WorkspaceOutline
            file={fileData}
            activePanel={leftPanel}
            onPanelChange={(view) => {
              setLeftPanel(view)
              setSidePanelOpen(true)
            }}
            onClose={() => setOutlineOpen(false)}
          />
        ) : null}

        <main className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            {isMedia ? (
              <MediaPlayer
                fileUrl={fileData.fileUrl}
                fileType={fileData.fileType as 'audio' | 'video'}
                timestamps={fileData.timestamps || []}
              />
            ) : (
              <PdfViewer fileUrl={fileData.fileUrl} />
            )}
          </div>

          {sidePanelOpen ? (
            <aside className="h-full w-[min(520px,34vw)] min-w-[420px] shrink-0 border-l border-border">
              <div className={leftPanel === 'document' ? 'h-full animate-panel-in' : 'hidden h-full'}>
                <TextEditor editor={editor} />
              </div>
              <div className={leftPanel === 'chat' ? 'h-full animate-panel-in' : 'hidden h-full'}>
                <ChatPanel embedded messages={chatMessages} setMessages={setChatMessages} />
              </div>
            </aside>
          ) : null}
        </main>
      </div>
    </div>
  )
}

export default Workspace
