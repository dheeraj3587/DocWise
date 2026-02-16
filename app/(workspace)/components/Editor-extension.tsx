import { useState, useEffect } from "react";
import { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Sparkle,
  Brain,
} from "lucide-react";

import "@tiptap/extension-highlight";
import "@tiptap/extension-underline";
import "@tiptap/extension-text-align";
import { saveNote } from "@/lib/api-client";
import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { marked } from "marked";

interface EditorExtensionProps {
  editor: Editor | null;
}

export const EditorExtension = ({ editor }: EditorExtensionProps) => {
  const [isActive, setIsActive] = useState(false);
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [deepMode, setDeepMode] = useState(false);

  const { fileId } = useParams();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    if (!editor) return;

    const updateActiveState = () => {
      setIsActive((prev) => !prev);
    };

    editor.on("update", updateActiveState);
    editor.on("selectionUpdate", updateActiveState);

    return () => {
      editor.off("update", updateActiveState);
      editor.off("selectionUpdate", updateActiveState);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  const onAiClick = async () => {
    setLoading(true);
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      " ",
    );

    if (!selectedText) {
      setLoading(false);
      return;
    }

    try {
      const token = await getToken();
      const currentPos = editor.state.doc.content.size;
      editor.commands.insertContentAt(
        currentPos,
        "<p><strong>Answer: </strong></p>",
      );
      const answerStartPos = editor.state.doc.content.size;
      let streamedAnswer = "";

      const response = await fetch(`${API_BASE}/api/chat/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: selectedText, file_id: fileId, deep_mode: deepMode }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.trim() === "") continue;
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                streamedAnswer += parsed.text;
              }
              const cleanedAnswer = streamedAnswer
                .replace(/```html/g, "")
                .replace(/```/g, "");
              const htmlAnswer = marked.parse(cleanedAnswer) as string;
              const endPos = editor.state.doc.content.size;
              editor.commands.deleteRange({ from: answerStartPos, to: endPos });
              editor.commands.insertContentAt(answerStartPos, htmlAnswer);
            } catch (e) {
              // skip malformed lines
            }
          }
        }
      }

      const Allnote = editor.getHTML();
      const saveToken = await getToken();
      await saveNote(fileId as string, Allnote, saveToken);
    } catch (error) {
      alert("Error: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toolbarBtnClass = (active: boolean, color: "default" | "amber" = "default") => {
    if (active) {
      return color === "amber"
        ? "p-2 rounded-lg bg-accent text-accent-foreground"
        : "p-2 rounded-lg bg-accent text-accent-foreground";
    }
    return "p-2 rounded-lg text-muted-foreground hover:text-foreground hover:surface-2 transition-all duration-150";
  };

  return (
    <div className="glass-subtle border-b border-border px-4 py-2.5 rounded-t-xl">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 px-1.5 py-1 surface-2 rounded-xl border border-border">
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={toolbarBtnClass(editor.isActive("heading", { level: 1 }))} title="Heading 1">
            <Heading1 className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={toolbarBtnClass(editor.isActive("heading", { level: 2 }))} title="Heading 2">
            <Heading2 className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={toolbarBtnClass(editor.isActive("heading", { level: 3 }))} title="Heading 3">
            <Heading3 className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-border mx-0.5" />

          <button onClick={() => editor.chain().focus().toggleBold().run()}
            className={toolbarBtnClass(editor.isActive("bold"))} title="Bold">
            <Bold className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()}
            className={toolbarBtnClass(editor.isActive("italic"))} title="Italic">
            <Italic className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={toolbarBtnClass(editor.isActive("underline"))} title="Underline">
            <Underline className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={toolbarBtnClass(editor.isActive("highlight"), "amber")} title="Highlight">
            <Highlighter className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-border mx-0.5" />

          <button onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={toolbarBtnClass(editor.isActive({ textAlign: "left" }))} title="Align Left">
            <AlignLeft className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={toolbarBtnClass(editor.isActive({ textAlign: "center" }))} title="Align Center">
            <AlignCenter className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={toolbarBtnClass(editor.isActive({ textAlign: "right" }))} title="Align Right">
            <AlignRight className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-border mx-0.5" />

          <button onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={toolbarBtnClass(editor.isActive("bulletList"))} title="Bullet List">
            <List className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={toolbarBtnClass(editor.isActive("orderedList"))} title="Ordered List">
            <ListOrdered className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onAiClick()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-l-lg transition-all duration-150 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="AI Assistant"
          >
            <Sparkle className="w-4 h-4" />
            <span>{loading ? "Thinking..." : "AI"}</span>
          </button>
          <button
            onClick={() => setDeepMode(!deepMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-r-lg transition-all duration-150 font-medium text-sm border border-border border-l-0 ${
              deepMode
                ? "bg-accent text-accent-foreground hover:bg-accent/80"
                : "surface-3 hover:surface-2 text-muted-foreground"
            }`}
            title={deepMode ? "Deep Mode ON (GPT-5.2)" : "Deep Mode OFF (GPT-5-mini)"}
          >
            <Brain className="w-4 h-4" />
            <span className="text-xs">{deepMode ? "Deep" : "Fast"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
