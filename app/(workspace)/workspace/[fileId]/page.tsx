'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useApiQuery } from '@/lib/hooks'
import { FileRecord } from '@/lib/api-client'
import { WorkspaceHeader } from '../../components/workspace-header'
import { PdfViewer } from '../../components/PdfViewer'
import { MediaPlayer } from '../../components/MediaPlayer'
import { ChatPanel } from '../../components/ChatPanel'
import { WorkspaceOutline, type DocumentTopic } from '../../components/workspace-outline'
import { WorkspaceSkeleton } from '@/app/skeleton/workspace-skeleton'

const Workspace = () => {
  const { fileId } = useParams()
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [sidePanelOpen, setSidePanelOpen] = useState(true)
  const [activePage, setActivePage] = useState(1)

  const { data: fileData, isLoading } = useApiQuery<FileRecord>(
    fileId ? `/api/files/${fileId}` : null,
    [fileId],
  )

  const { data: topics = [], isLoading: topicsLoading } = useApiQuery<DocumentTopic[]>(
    fileId && fileData?.fileType === 'pdf' ? `/api/chat/topics/${fileId}` : null,
    [fileId, fileData?.fileType],
  )

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
        fileName={fileData.fileName}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={() => setSidePanelOpen((open) => !open)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {outlineOpen ? (
          <WorkspaceOutline
            file={fileData}
            topics={topics}
            topicsLoading={topicsLoading}
            activePage={activePage}
            onSelectPage={(page) => {
              setActivePage(page)
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
              <PdfViewer fileUrl={fileData.fileUrl} page={activePage} />
            )}
          </div>

          {sidePanelOpen ? (
            <aside className="h-full w-[min(520px,34vw)] min-w-[420px] shrink-0 border-l border-border">
              <ChatPanel embedded />
            </aside>
          ) : null}
        </main>
      </div>
    </div>
  )
}

export default Workspace
