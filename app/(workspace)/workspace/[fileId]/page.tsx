"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks";
import { FileRecord } from "@/lib/api-client";
import { WorkspaceHeader } from "../../components/workspace-header";
import { PdfViewer } from "../../components/PdfViewer";
import { MediaPlayer } from "../../components/MediaPlayer";
import { ChatPanel } from "../../components/ChatPanel";
import { NotesPanel } from "../../components/notes-panel";
import {
  WorkspaceOutline,
  type DocumentTopic,
} from "../../components/workspace-outline";
import { cn } from "@/lib/utils";
import { WorkspaceSkeleton } from "@/app/skeleton/workspace-skeleton";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizableLayout,
} from "@/components/ui/resizable";
import type { ChatCitation } from "@/lib/chat-api";
import { isFileProcessing } from "@/lib/file-status";

/**
 * Chat|Notes switch for the side panel. The notes editor shipped in the repo
 * but nothing ever rendered it, so this is the only way into it.
 */
const SidePanelTabs = ({
  value,
  onChange,
}: {
  value: "chat" | "notes";
  onChange: (next: "chat" | "notes") => void;
}) => (
  <div
    role="tablist"
    aria-label="Side panel"
    className="flex shrink-0 items-center gap-1 border-b border-border bg-background px-3 py-2"
  >
    {(["chat", "notes"] as const).map((tab) => (
      <button
        key={tab}
        type="button"
        role="tab"
        aria-selected={value === tab}
        onClick={() => onChange(tab)}
        className={cn(
          "rounded-md px-2.5 py-1 text-[12px] capitalize transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          value === tab
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {tab}
      </button>
    ))}
  </div>
);

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
  const [sideTab, setSideTab] = useState<"chat" | "notes">("chat");

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

  const {
    data: fileData,
    isLoading,
    refetch,
    // Ingestion runs in a Celery worker with no push channel, so poll until the
    // file leaves `processing` — otherwise the workspace sits on stale state.
  } = useApiQuery<FileRecord>(
    fileId ? `/api/files/${fileId}` : null,
    [fileId],
    {
      refreshInterval: (record) =>
        isFileProcessing(record?.status) ? 4000 : 0,
    },
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
        fileStatus={fileData.status}
        fileUrl={fileData.fileUrl}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
        sidePanelOpen={sidePanelOpen}
        onToggleSidePanel={() => setSidePanelOpen((open) => !open)}
        onRefresh={refetch}
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
              <aside className="flex h-full min-h-0 flex-col border-l border-border bg-background">
                <SidePanelTabs value={sideTab} onChange={setSideTab} />
                {/* Both stay mounted: switching tabs mid-stream would drop the
                    SSE connection, and remounting notes would refetch them. */}
                <div
                  className={cn(
                    "min-h-0 flex-1",
                    sideTab === "chat" ? "" : "hidden",
                  )}
                >
                  <ChatPanel
                    embedded
                    compact
                    fileId={String(fileId)}
                    onCitationNavigate={navigateCitation}
                  />
                </div>
                <div
                  className={cn(
                    "min-h-0 flex-1",
                    sideTab === "notes" ? "" : "hidden",
                  )}
                >
                  <NotesPanel fileId={String(fileId)} />
                </div>
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
            <aside className="absolute inset-0 z-30 flex min-h-0 flex-col bg-background">
              <SidePanelTabs value={sideTab} onChange={setSideTab} />
              <div
                className={cn(
                  "min-h-0 flex-1",
                  sideTab === "chat" ? "" : "hidden",
                )}
              >
                <ChatPanel
                  embedded
                  compact
                  fileId={String(fileId)}
                  onCitationNavigate={navigateCitation}
                />
              </div>
              <div
                className={cn(
                  "min-h-0 flex-1",
                  sideTab === "notes" ? "" : "hidden",
                )}
              >
                <NotesPanel fileId={String(fileId)} />
              </div>
            </aside>
          ) : null}
        </main>
      )}
    </div>
  );
};

export default Workspace;
