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
      // Prepare placeholder for streaming answer
      const token = await getToken();

      // Insert initial placeholder at the end of current content
      const currentPos = editor.state.doc.content.size;
      editor.commands.insertContentAt(
        currentPos,
        "<p><strong>Answer: </strong></p>",
      );

      // Store the position where we'll insert streaming content
      const answerStartPos = editor.state.doc.content.size;

      let streamedAnswer = "";

      // Stream from backend RAG endpoint
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

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });

        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.trim() === "") continue;

          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();

            if (data === "[DONE]") {
              break;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.text) {
                streamedAnswer += parsed.text;
              }

              // Clean the answer
              const cleanedAnswer = streamedAnswer
                .replace(/```html/g, "")
                .replace(/```/g, "");

              // Convert markdown to HTML for TipTap
              const htmlAnswer = marked.parse(cleanedAnswer) as string;

              // Delete previous answer content and insert updated one
              const endPos = editor.state.doc.content.size;

              // Delete from answer start to end
              editor.commands.deleteRange({
                from: answerStartPos,
                to: endPos,
              });

              // Insert updated content as HTML
              editor.commands.insertContentAt(answerStartPos, htmlAnswer);
            } catch (e) {
              // skip malformed lines
            }
          }
        }
      }

      // Save to database
      const Allnote = editor.getHTML();
      const saveToken = await getToken();
      await saveNote(
        fileId as string,
        Allnote,
        saveToken,
      );

    } catch (error) {
      alert("Error: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-linear-to-b from-white to-gray-50/50 border-b border-gray-200/80 px-6 py-3 rounded-t-xl shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Unified Toolbar Group */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 bg-white rounded-lg border border-gray-200/60 shadow-sm">
          {/* Headings */}
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive("heading", { level: 1 })
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive("heading", { level: 2 })
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive("heading", { level: 3 })
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Heading 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-200 mx-1" />

          {/* Formatting */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive("bold")
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive("italic")
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive("underline")
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive("highlight")
                ? "bg-amber-50 text-amber-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Highlight"
          >
            <Highlighter className="w-4 h-4" />
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-200 mx-1" />

          {/* Alignment */}
          <button
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive({ textAlign: "left" })
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive({ textAlign: "center" })
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive({ textAlign: "right" })
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Align Right"
          >
            <AlignRight className="w-4 h-4" />
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-200 mx-1" />

          {/* Lists */}
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive("bulletList")
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 rounded-md transition-all duration-150 ${
              editor.isActive("orderedList")
                ? "bg-blue-50 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title="Ordered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
        </div>

        {/* AI Button - Separate but cohesive */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onAiClick()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#d8b131] hover:bg-[#D4AF37] text-white rounded-l-lg shadow-sm hover:shadow-md transition-all duration-150 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="AI Assistant"
          >
            <Sparkle className="w-4 h-4" />
            <span>{loading ? "Thinking..." : "AI"}</span>
          </button>
          <button
            onClick={() => setDeepMode(!deepMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-r-lg shadow-sm transition-all duration-150 font-medium text-sm border-l border-white/20 ${
              deepMode
                ? "bg-purple-600 hover:bg-purple-700 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-600"
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
