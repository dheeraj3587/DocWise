"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";

import { getNotes, saveNote } from "@/lib/api-client";
import { showRetryToast } from "@/lib/app-toasts";
import { EditorExtension } from "./Editor-extension";

type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 1200;

/**
 * Per-document notes. The editor and its toolbar already existed but nothing
 * ever rendered them, so notes could only be written by the toolbar's AI insert
 * and were never loaded back. This mounts them and adds debounced autosave.
 */
export function NotesPanel({ fileId }: { fileId: string }) {
  const { getToken } = useAuth();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHtmlRef = useRef<string | null>(null);

  const persist = useCallback(
    async (html: string) => {
      // A hoisted declaration so the retry handler can call the same attempt
      // again without the callback having to reference its own binding.
      async function attempt(): Promise<void> {
        setSaveState("saving");
        try {
          const token = await getToken();
          await saveNote(fileId, html, token);
          setSaveState("saved");
        } catch (error) {
          setSaveState("error");
          showRetryToast({
            title: "Note not saved",
            description:
              (error as Error).message || "The note could not be saved.",
            onRetry: () => void attempt(),
          });
        }
      }

      await attempt();
    },
    [fileId, getToken],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({
        placeholder: "Take notes on this document...",
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none px-5 py-4 min-h-full outline-none text-[13px] leading-6",
      },
    },
    onUpdate: ({ editor: instance }) => {
      pendingHtmlRef.current = instance.getHTML();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const html = pendingHtmlRef.current;
        if (html !== null) void persist(html);
      }, AUTOSAVE_DELAY_MS);
    },
  });

  // Load the stored note once the editor exists.
  useEffect(() => {
    if (!editor || loaded) return;
    let cancelled = false;

    getToken()
      .then((token) => getNotes(fileId, token))
      .then((notes) => {
        if (cancelled) return;
        const stored = notes?.[0]?.note;
        if (stored) editor.commands.setContent(stored, { emitUpdate: false });
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [editor, fileId, getToken, loaded]);

  // Flush anything still queued when the panel unmounts.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const html = pendingHtmlRef.current;
      if (html !== null) void persist(html);
    };
  }, [persist]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="z-10 shrink-0">
        <EditorExtension editor={editor} />
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
      <div className="mono-label flex shrink-0 items-center justify-between border-t border-border px-4 py-2">
        <span>Notes</span>
        <span>
          {saveState === "saving"
            ? "Saving..."
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? "Not saved"
                : "Autosave on"}
        </span>
      </div>
    </section>
  );
}
