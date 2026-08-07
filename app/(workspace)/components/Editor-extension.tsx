import { useReducer, useRef, useState, useEffect } from "react";
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
import { renderMarkdownWithMath } from "@/lib/markdown-math";
import { getApiBase } from "@/lib/api-base";
import { showRetryToast } from "@/lib/app-toasts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EditorExtensionProps {
  editor: Editor | null;
}

export const EditorExtension = ({ editor }: EditorExtensionProps) => {
  const [, forceRerender] = useReducer((value: number) => value + 1, 0);
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [deepMode, setDeepMode] = useState(false);
  const [effort, setEffort] = useState<"low" | "medium" | "high">("medium");

  const { fileId } = useParams();
  const API_BASE = getApiBase();
  const prevActiveRef = useRef("");

  useEffect(() => {
    if (!editor) return;

    const updateIfChanged = () => {
      // Build a fingerprint of active toolbar states
      const active = [
        editor.isActive("heading", { level: 1 }),
        editor.isActive("heading", { level: 2 }),
        editor.isActive("heading", { level: 3 }),
        editor.isActive("bold"),
        editor.isActive("italic"),
        editor.isActive("underline"),
        editor.isActive("highlight"),
        editor.isActive({ textAlign: "left" }),
        editor.isActive({ textAlign: "center" }),
        editor.isActive({ textAlign: "right" }),
        editor.isActive("bulletList"),
        editor.isActive("orderedList"),
      ].join(",");

      if (active !== prevActiveRef.current) {
        prevActiveRef.current = active;
        forceRerender();
      }
    };

    editor.on("update", updateIfChanged);
    editor.on("selectionUpdate", updateIfChanged);

    return () => {
      editor.off("update", updateIfChanged);
      editor.off("selectionUpdate", updateIfChanged);
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
        body: JSON.stringify({
          question: selectedText,
          file_id: fileId,
          deep_mode: deepMode,
          reasoning_effort: deepMode ? effort : null,
        }),
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
              const htmlAnswer = renderMarkdownWithMath(cleanedAnswer);
              const endPos = editor.state.doc.content.size;
              editor.commands.deleteRange({ from: answerStartPos, to: endPos });
              editor.commands.insertContentAt(answerStartPos, htmlAnswer);
            } catch {
              // skip malformed lines
            }
          }
        }
      }

      const Allnote = editor.getHTML();
      const saveToken = await getToken();
      await saveNote(fileId as string, Allnote, saveToken);
    } catch (error) {
      showRetryToast({
        title: "AI request failed",
        description: (error as Error).message,
        onRetry: () => void onAiClick(),
      });
    } finally {
      setLoading(false);
    }
  };

  const toolbarBtnClass = (active: boolean) =>
    cn(
      "grid size-8 place-items-center rounded-lg outline-none transition-[background-color,color] duration-[180ms] ease-out focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "bg-background text-foreground"
        : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
    );

  const runEditorCommand = (command: string, value?: unknown) => {
    const chain = editor.chain().focus() as unknown as Record<
      string,
      (value?: unknown) => { run: () => boolean }
    >;
    const commandRunner = chain[command];
    if (commandRunner) {
      commandRunner(value).run();
    }
  };

  return (
    <div className="docwise-rail border-b px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="docwise-segment flex-wrap">
          <button
            type="button"
            onClick={() => runEditorCommand("toggleHeading", { level: 1 })}
            className={toolbarBtnClass(
              editor.isActive("heading", { level: 1 }),
            )}
            title="Heading 1"
          >
            <Heading1 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => runEditorCommand("toggleHeading", { level: 2 })}
            className={toolbarBtnClass(
              editor.isActive("heading", { level: 2 }),
            )}
            title="Heading 2"
          >
            <Heading2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => runEditorCommand("toggleHeading", { level: 3 })}
            className={toolbarBtnClass(
              editor.isActive("heading", { level: 3 }),
            )}
            title="Heading 3"
          >
            <Heading3 className="size-4" />
          </button>

          <div className="mx-1 h-5 w-px bg-border" />

          <button
            type="button"
            onClick={() => runEditorCommand("toggleBold")}
            className={toolbarBtnClass(editor.isActive("bold"))}
            title="Bold"
          >
            <Bold className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => runEditorCommand("toggleItalic")}
            className={toolbarBtnClass(editor.isActive("italic"))}
            title="Italic"
          >
            <Italic className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => runEditorCommand("toggleUnderline")}
            className={toolbarBtnClass(editor.isActive("underline"))}
            title="Underline"
          >
            <Underline className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => runEditorCommand("toggleHighlight")}
            className={toolbarBtnClass(editor.isActive("highlight"))}
            title="Highlight"
          >
            <Highlighter className="size-4" />
          </button>

          <div className="mx-1 h-5 w-px bg-border" />

          <button
            type="button"
            onClick={() => runEditorCommand("setTextAlign", "left")}
            className={toolbarBtnClass(editor.isActive({ textAlign: "left" }))}
            title="Align Left"
          >
            <AlignLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => runEditorCommand("setTextAlign", "center")}
            className={toolbarBtnClass(
              editor.isActive({ textAlign: "center" }),
            )}
            title="Align Center"
          >
            <AlignCenter className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => runEditorCommand("setTextAlign", "right")}
            className={toolbarBtnClass(editor.isActive({ textAlign: "right" }))}
            title="Align Right"
          >
            <AlignRight className="size-4" />
          </button>

          <div className="mx-1 h-5 w-px bg-border" />

          <button
            type="button"
            onClick={() => runEditorCommand("toggleBulletList")}
            className={toolbarBtnClass(editor.isActive("bulletList"))}
            title="Bullet List"
          >
            <List className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => runEditorCommand("toggleOrderedList")}
            className={toolbarBtnClass(editor.isActive("orderedList"))}
            title="Ordered List"
          >
            <ListOrdered className="size-4" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDeepMode(!deepMode)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[10px] uppercase tracking-label outline-none transition-[background-color,border-color,color] duration-[180ms] ease-out focus-visible:ring-2 focus-visible:ring-ring",
              deepMode
                ? "border-foreground/20 bg-secondary text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/20 hover:bg-secondary hover:text-foreground",
            )}
            title={deepMode ? "Deep reasoning ON" : "Fast reasoning mode"}
            aria-pressed={deepMode}
          >
            <Brain className="size-3.5" />
            <span>{deepMode ? "Deep" : "Fast"}</span>
          </button>
          {deepMode ? (
            <div
              role="radiogroup"
              aria-label="Reasoning effort"
              className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-border p-0.5"
            >
              {(["low", "medium", "high"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={effort === level}
                  onClick={() => setEffort(level)}
                  title={`Reasoning effort: ${level}`}
                  className={cn(
                    "h-full min-w-[30px] rounded-md px-1.5 font-mono text-[10px] uppercase tracking-label outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    effort === level
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {level === "medium" ? "Med" : level}
                </button>
              ))}
            </div>
          ) : null}
          <Button
            type="button"
            onClick={() => onAiClick()}
            loading={loading}
            disabled={loading}
            title="AI Assistant"
          >
            <Sparkle className="size-4" />
            <span>{loading ? "Thinking" : "AI"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
