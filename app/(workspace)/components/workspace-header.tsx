import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { saveNote } from "@/lib/api-client";
import { useState } from "react";
import { Editor } from "@tiptap/react";
import { Undo2, FileText, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import { ThemeToggle } from "@/components/theme-toggle";
import type { LeftPanelView } from "../workspace/[fileId]/page";

export const WorkspaceHeader = ({
  fileName,
  editor,
  leftPanel,
  onLeftPanelChange,
}: {
  fileName: string;
  editor: Editor | null;
  leftPanel: LeftPanelView;
  onLeftPanelChange: (view: LeftPanelView) => void;
}) => {
  const router = useRouter();
  const { fileId } = useParams();
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const { getToken } = useAuth();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
        const summaryHtml = await marked.parse(summary);
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

  return (
    <header className="h-16 glass-subtle border-b border-border px-4 lg:px-8 flex-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Undo2
            size={20}
            onClick={handleBack}
            className="surface-3 w-10 h-10 p-2 rounded-xl cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
          />
          <h1 className="text-lg font-semibold text-foreground">Workspace</h1>
        </div>

        <div className="flex items-center glass rounded-xl p-0.5 gap-0.5">
          <button
            onClick={() => onLeftPanelChange("document")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${leftPanel === "document"
              ? "surface-3 text-foreground glow-gold-subtle"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Notes</span>
          </button>
          <button
            onClick={() => onLeftPanelChange("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${leftPanel === "chat"
              ? "surface-3 text-foreground glow-gold-subtle"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">AI Chat</span>
          </button>
        </div>

        <div className="lg:hidden flex flex-col justify-center items-center">
          <h1 className="text-lg font-semibold text-foreground">Workspace</h1>
        </div>
      </div>

      <div className="font-bold text-foreground uppercase text-sm tracking-wide hidden md:block">{fileName}</div>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleSummarize} disabled={summarizing} className="text-sm">
          {summarizing ? "Summarizing..." : "Summarize"}
        </Button>
        <Button onClick={handleSave} disabled={loading} className="text-sm">
          {loading ? "Saving..." : "Save"}
        </Button>
        <ThemeToggle />
        <UserButton
          appearance={{
            elements: {
              userButtonAvatar: "w-12 h-12",
              userButtonTrigger: "p-2",
            },
          }}
        />
      </div>
    </header>
  );
};
