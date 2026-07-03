import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { saveNote } from "@/lib/api-client";
import { useState } from "react";
import { Editor } from "@tiptap/react";
import {
  ArrowLeft,
  Download,
  FileText,
  MessageCircle,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { escapeHtml, renderMarkdownWithMath } from "@/lib/markdown-math";
import { getApiBase } from "@/lib/api-base";
import type { ChatMessage } from "./ChatPanel";
import type { LeftPanelView } from "../workspace/[fileId]/page";

export const WorkspaceHeader = ({
  fileName,
  editor,
  leftPanel,
  onLeftPanelChange,
  chatMessages,
  outlineOpen,
  onToggleOutline,
  sidePanelOpen,
  onToggleSidePanel,
}: {
  fileName: string;
  editor: Editor | null;
  leftPanel: LeftPanelView;
  onLeftPanelChange: (view: LeftPanelView) => void;
  chatMessages: ChatMessage[];
  outlineOpen: boolean;
  onToggleOutline: () => void;
  sidePanelOpen: boolean;
  onToggleSidePanel: () => void;
}) => {
  const router = useRouter();
  const { fileId } = useParams();
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const { getToken } = useAuth();
  const API_BASE = getApiBase();

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      await saveNote(
        fileId as string,
        editor?.getHTML() as string,
        token,
      );
    } catch (error) {
      console.error("Error saving note:", error);
    }
    setLoading(false);
  };

  const handleSummarize = async () => {
    if (!editor) return;
    setSummarizing(true);
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE}/api/chat/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ file_id: fileId }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Summarize failed: ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let summary = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              summary += parsed.text;
            }
          } catch {
            // ignore malformed line
          }
        }
      }

      if (summary) {
        const summaryHtml = renderMarkdownWithMath(summary);
        const endPos = editor.state.doc.content.size;
        editor
          .chain()
          .focus()
          .insertContentAt(endPos, "<hr>")
          .insertContentAt(editor.state.doc.content.size, "<h2>Summary</h2>")
          .insertContentAt(editor.state.doc.content.size, summaryHtml)
          .run();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSummarizing(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handleExportPdf = () => {
    if (!editor) return;

    const includeChats = chatMessages.length > 0
      ? window.confirm("Include the AI chat history in this PDF export?")
      : false;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const chatHtml = includeChats
      ? `
        <section class="chat-section">
          <h2>AI Chat</h2>
          ${chatMessages
            .filter((message) => message.content.trim())
            .map((message) => `
              <article class="chat-message ${message.role}">
                <div class="chat-role">${message.role === "user" ? "You" : "DocWise"}</div>
                <div class="chat-content">${message.role === "assistant"
                  ? renderMarkdownWithMath(message.content)
                  : `<p>${escapeHtml(message.content).replace(/\n/g, "<br>")}</p>`
                }</div>
              </article>
            `)
            .join("")}
        </section>
      `
      : "";

    const safeTitle = fileName || "DocWise Notes";
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(safeTitle)} - Notes Export</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css">
          <style>
            @page { margin: 0.65in; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #171717;
              background: #fff;
              font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
              font-size: 12pt;
              line-height: 1.55;
            }
            header {
              border-bottom: 1px solid #d8d3c7;
              margin-bottom: 24px;
              padding-bottom: 14px;
            }
            h1, h2, h3 { line-height: 1.2; margin: 1.1em 0 0.45em; }
            h1 { font-size: 24pt; margin-top: 0; }
            h2 { font-size: 17pt; border-bottom: 1px solid #ece7da; padding-bottom: 6px; }
            h3 { font-size: 14pt; }
            p { margin: 0.35em 0 0.8em; }
            ul, ol { padding-left: 1.4em; }
            code {
              font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
              font-size: 0.9em;
              background: #f5f2ea;
              border-radius: 4px;
              padding: 0.12em 0.3em;
            }
            pre {
              background: #f5f2ea;
              border: 1px solid #e3ddce;
              border-radius: 8px;
              padding: 12px;
              overflow-wrap: anywhere;
              white-space: pre-wrap;
            }
            blockquote {
              border-left: 3px solid #c49a3a;
              margin-left: 0;
              padding-left: 14px;
              color: #4d4a43;
            }
            .meta {
              color: #6d675c;
              font-size: 9.5pt;
              letter-spacing: 0.04em;
              text-transform: uppercase;
            }
            .notes { margin-bottom: 28px; }
            .chat-section { break-before: page; }
            .chat-message {
              border: 1px solid #e7e0d1;
              border-radius: 10px;
              padding: 12px 14px;
              margin: 12px 0;
              break-inside: avoid;
            }
            .chat-message.user { background: #f7f4ee; }
            .chat-message.assistant { background: #ffffff; }
            .chat-role {
              color: #8a6b19;
              font-family: ui-sans-serif, system-ui, sans-serif;
              font-size: 8.5pt;
              font-weight: 700;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              margin-bottom: 6px;
            }
            .katex-display { margin: 0.9em 0; overflow-x: auto; overflow-y: hidden; }
            @media print {
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <header>
            <div class="meta">DocWise Notes Export</div>
            <h1>${escapeHtml(safeTitle)}</h1>
            <div class="meta">${new Date().toLocaleString()}</div>
          </header>
          <main>
            <section class="notes">${editor.getHTML()}</section>
            ${chatHtml}
          </main>
          <script>
            window.addEventListener("load", () => {
              window.focus();
              window.print();
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const switchPanel = (view: LeftPanelView) => {
    onLeftPanelChange(view);
  };

  const iconButtonClass =
    "grid h-9 w-9 place-items-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground";
  const activeIconButtonClass =
    "grid h-9 w-9 place-items-center rounded-lg border border-border bg-secondary text-foreground transition-colors hover:bg-secondary/80";

  return (
    <header className="flex h-[68px] shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 items-center gap-2 rounded-lg border border-transparent px-2.5 text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden text-[13px] sm:inline">Dashboard</span>
        </button>

        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <button
          type="button"
          aria-label="Toggle outline"
          title="Toggle outline"
          onClick={onToggleOutline}
          className={outlineOpen ? activeIconButtonClass : iconButtonClass}
        >
          {outlineOpen ? (
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>

        <div className="ml-1 flex min-w-0 flex-col justify-center">
          <span className="truncate text-[14px] text-foreground">{fileName}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
            <span className="mono-label text-emerald-300/80">Ready</span>
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1 md:flex">
          <button
            type="button"
            onClick={() => switchPanel("document")}
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors ${
              leftPanel === "document"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" strokeWidth={1.75} />
            Notes
          </button>
          <button
            type="button"
            onClick={() => switchPanel("chat")}
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors ${
              leftPanel === "chat"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
            Chat
          </button>
        </div>

        <div className="mx-1 hidden h-6 w-px bg-border md:block" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSummarize}
          disabled={summarizing}
          className="hidden h-9 rounded-lg px-2.5 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground md:inline-flex"
        >
          <Sparkles className="h-4 w-4" />
          {summarizing ? "Summarizing" : "Summarize"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExportPdf}
          disabled={!editor}
          className="hidden h-9 rounded-lg px-2.5 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground md:inline-flex"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={loading}
          className="h-9 rounded-lg px-2.5 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Save className="h-4 w-4" />
          <span className="hidden sm:inline">{loading ? "Saving" : "Save"}</span>
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />

        <button
          type="button"
          aria-label="Toggle workspace panel"
          title="Toggle workspace panel"
          onClick={onToggleSidePanel}
          className={sidePanelOpen ? activeIconButtonClass : iconButtonClass}
        >
          {sidePanelOpen ? (
            <PanelRightClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <PanelRightOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>

        <button
          type="button"
          aria-label="More options"
          className={iconButtonClass}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>

        <div className="hidden md:block">
          <ThemeToggle />
        </div>
        <UserButton
          appearance={{
            elements: {
              userButtonAvatar: "h-9 w-9",
              userButtonTrigger: "p-0",
            },
          }}
        />
      </div>
    </header>
  );
};
