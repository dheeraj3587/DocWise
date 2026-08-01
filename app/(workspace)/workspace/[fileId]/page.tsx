"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks";
import { FileRecord } from "@/lib/api-client";
import { WorkspaceHeader } from "../../components/workspace-header";
fixxxyyfixtttnhhhyyyyyyyyimport { PdfViewer } from "../../components/PdfViewer";
import { MediaPlayer } from "../../components/MediaPlayer";
import { ChatPanel } from "../../components/ChatPanel";
import {
  WorkspaceOutline,
  type DocumentTopic,
} from "../../components/workspace-outline";
import { WorkspaceSkeleton } from "@/app/skeleton/workspace-skeleton";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableLayout,
} from "@/components/ui/resizable";
import type { ChatCitation } from "@/lib/chat-api";

const Workspace = () => {
  const { fileId } = useParams();
  const searchParams = useSearchParams();
  const requestedPage = Number(searchParams.get("page"));
  const initialPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [activePage, setActivePage] = useState(initialPage);
  const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);
  const [desktopLayout, setDesktopLayout] = useState<boolean | null>(null);

  // Remember the split the user drags to. `panelIds` tracks which rails are
  // open so toggling one doesn't clobber the sizes saved for the other states.
  const { defaultLayout, onLayoutChanged } = useResizableLayout({
    id: "docwise-workspace",
    panelIds: [
      ...(outlineOpen ? ["workspace-outline"] : []),
      "workspace-document",
      ...(sidePanelOpen ? ["workspace-chat"] : []),
    ],
  });

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const syncLayout = () => {
      setDesktopLayout(query.matches);
      setOutlineOpen(query.matches);
      setSidePanelOpen(query.matches);
    };

    syncLayout();
    query.addEventListener("change", syncLayout);
    return () => query.removeEventListener("change", syncLayout);
  }, []);

  const { data: fileData, isLoading } = useApiQuery<FileRecord>(
    fileId ? `/api/files/${fileId}` : null,
    [fileId],
  );

  const { data: topics = [], isLoading: topicsLoading } = useApiQuery<
    DocumentTopic[]
  >(
    fileId && fileData?.fileType === "pdf"
      ? `/api/chat/topics/${fileId}`
      : null,
    [fileId, fileData?.fileType],
  );

  if (!fileId) {
    return <div>file not found</div>;
  }

  if (isLoading || desktopLayout === null) {
    return <WorkspaceSkeleton />;
  }

  if (!fileData) {
    return <div>File not found</div>;
  }

  const isMedia =
    fileData.fileType === "audio" || fileData.fileType === "video";

  const navigateCitation = (citation: ChatCitation) => {
    if (citation.fileId !== String(fileId)) {
      const page = citation.pageStart ? `?page=${citation.pageStart}` : "";
      window.location.assign(`/workspace/${citation.fileId}${page}`);
      return;
    }
    if (citation.pageStart) setActivePage(citation.pageStart);
    if (citation.startTime != null) setActiveTimestamp(citation.startTime);
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceHeader
        fileName={fileData.fileName}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={() => setSidePanelOpen((open) => !open)}
      />

      {desktopLayout ? (
        <ResizablePanelGroup
          id="docwise-workspace"
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="min-h-0 flex-1 overflow-hidden"
        >
          {outlineOpen ? (
            <ResizablePanel
              id="workspace-outline"
              defaultSize="18%"
              minSize="220px"
              maxSize="360px"
            >
              <WorkspaceOutline
                file={fileData}
                topics={topics}
                topicsLoading={topicsLoading}
                activePage={activePage}
                onSelectPage={setActivePage}
                onClose={() => setOutlineOpen(false)}
              />
            </ResizablePanel>
          ) : null}

          {outlineOpen ? <ResizableHandle /> : null}

          <ResizablePanel id="workspace-document" minSize="360px">
            {isMedia ? (
              <MediaPlayer
                fileUrl={fileData.fileUrl}
                fileType={fileData.fileType as "audio" | "video"}
                timestamps={fileData.timestamps || []}
                seekToTime={activeTimestamp}
              />
            ) : (
              <PdfViewer fileUrl={fileData.fileUrl} page={activePage} />
            )}
          </ResizablePanel>

          {sidePanelOpen ? <ResizableHandle /> : null}

          {sidePanelOpen ? (
            <ResizablePanel
              id="workspace-chat"
              defaultSize="29%"
              minSize="380px"
              maxSize="640px"
            >
              <aside className="h-full border-l border-border bg-background">
                <ChatPanel
                  embedded
                  compact
                  fileId={String(fileId)}
                  onCitationNavigate={navigateCitation}
                />
              </aside>
            </ResizablePanel>
          ) : null}
        </ResizablePanelGroup>
      ) : (
        <main className="relative min-h-0 flex-1 overflow-hidden">
          {isMedia ? (
            <MediaPlayer
              fileUrl={fileData.fileUrl}
              fileType={fileData.fileType as "audio" | "video"}
              timestamps={fileData.timestamps || []}
              seekToTime={activeTimestamp}
            />
          ) : (
            <PdfViewer fileUrl={fileData.fileUrl} page={activePage} />
          )}

          {outlineOpen ? (
            <div className="absolute inset-0 z-30 bg-background">
              <WorkspaceOutline
                file={fileData}
                topics={topics}
                topicsLoading={topicsLoading}
                activePage={activePage}
                onSelectPage={(page) => {
                  setActivePage(page);
                  setOutlineOpen(false);
                }}
                onClose={() => setOutlineOpen(false)}
              />
            </div>
          ) : null}

          {sidePanelOpen ? (
            <aside className="absolute inset-0 z-30 bg-background">
              <ChatPanel
                embedded
                compact
                fileId={String(fileId)}
                onCitationNavigate={navigateCitation}
              />
            </aside>
          ) : null}
        </main>
      )}
    </div>
  );
};

export default Workspace;
