import katex from "katex";
import { marked } from "marked";

const BLOCK_MATH = /\$\$([\s\S]+?)\$\$/g;
const INLINE_MATH = /(?<!\\)\$([^\n$]+?)(?<!\\)\$/g;

function renderMath(source: string): string {
  return source
    .replace(BLOCK_MATH, (_, expression: string) => {
      return katex.renderToString(expression.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    })
    .replace(INLINE_MATH, (_, expression: string) => {
      return katex.renderToString(expression.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    });
}

export function renderMarkdownWithMath(source: string): string {
  return String(marked.parse(renderMath(source)));
}

export function escapeHtml(source: string): string {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
