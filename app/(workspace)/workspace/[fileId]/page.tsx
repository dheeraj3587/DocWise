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
import { ChatPanel } from '../../components/ChatPanel'
import { WorkspaceSkeleton } from '@/app/skeleton/workspace-skeleton'

import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle
} from 'react-resizable-panels'

export type RightPanelView = 'document' | 'chat'

const Workspace = () => {
  const { fileId } = useParams()
  const [rightPanel, setRightPanel] = useState<RightPanelView>('document')

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
                class: 'prose prose-slate max-w-none focus:outline-none min-h-[500px] px-8 py-6',
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
    <div className="flex flex-col h-screen">
      <WorkspaceHeader
        editor={editor}
        fileName={fileData.fileName}
        rightPanel={rightPanel}
        onRightPanelChange={setRightPanel}
      />

      <div className="flex-1 overflow-hidden p-4">
        <PanelGroup orientation="horizontal" className="h-full">
          <Panel defaultSize={50} minSize={20} className="h-full">
            <TextEditor editor={editor} />
          </Panel>

          <PanelResizeHandle className="w-2 cursor-col-resize" />

          <Panel defaultSize={50} minSize={20} className="h-full">
            {rightPanel === 'chat' ? (
              <ChatPanel embedded />
            ) : isMedia ? (
              <MediaPlayer
                fileUrl={fileData.fileUrl}
                fileType={fileData.fileType as 'audio' | 'video'}
                timestamps={fileData.timestamps || []}
              />
            ) : (
              <PdfViewer fileUrl={fileData.fileUrl} />
            )}
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}

export default Workspace
