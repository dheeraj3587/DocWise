import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { saveNote } from "@/lib/api-client";
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { Editor } from "@tiptap/react";
import { Undo2, FileText, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
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

  const { user } = useUser();
  const { getToken } = useAuth();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const HandleSave = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      await saveNote(
        fileId as string,
        editor?.getHTML() as string,
        user?.primaryEmailAddress?.emailAddress as string,
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
      const insertPos = editor.state.doc.content.size;
      editor.commands.insertContentAt(insertPos, "<h2>Summary</h2><p></p>");
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
              const endPos = editor.state.doc.content.size;
              editor.commands.deleteRange({ from: insertPos + 17, to: endPos });
              editor.commands.insertContentAt(insertPos + 17, summary);
            }
          } catch {
            // ignore malformed line
          }
        }
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
    <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Undo2
            size={20}
            onClick={handleBack}
            className="bg-slate-200 w-10 h-10 p-2 rounded-full cursor-pointer"
          />
          <h1 className="text-lg font-semibold text-slate-900">Workspace</h1>
        </div>
        {/* Document / Chat toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => onLeftPanelChange("document")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${leftPanel === "document"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
              }`}
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Notes</span>
          </button>
          <button
            onClick={() => onLeftPanelChange("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${leftPanel === "chat"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
              }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">AI Chat</span>
          </button>
        </div>
        <div className="lg:hidden flex flex-col justify-center items-center">
          <h1 className="text-lg font-semibold text-slate-900">Workspace</h1>
        </div>
      </div>

      <div className="font-bold text-slate-900 uppercase">{fileName}</div>

      {/* Profile */}

      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={handleSummarize} disabled={summarizing}>
          {summarizing ? "Summarizing..." : "Summarize"}
        </Button>
        <Button onClick={HandleSave} disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
        <UserButton
          appearance={{
            elements: {
              userButtonAvatar: "w-12 h-12", // Tailwind classes
              userButtonTrigger: "p-2",
            },
          }}
        />
      </div>
    </header>
  );
};
