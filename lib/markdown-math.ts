import katex from "katex";
import { marked } from "marked";

const BLOCK_MATH = /\$\$([\s\S]+?)\$\$/g;
const INLINE_MATH = /(?<!\\)\$([^\n$]+?)(?<!\\)\$/g;
const CODE_REGION = /(```[\s\S]*?```|`[^`\n]*`)/g;

function mapMarkdownText(source: string, mapper: (segment: string) => string): string {
  return source
    .split(CODE_REGION)
    .map((segment) => {
      if (segment.startsWith("```") || segment.startsWith("`")) {
        return segment;
      }
      return mapper(segment);
    })
    .join("");
}

export function normalizeMathDelimiters(source: string): string {
  return mapMarkdownText(source, (segment) =>
    segment
      .replace(/\\begin\{(equation|equation\*|align|align\*)\}([\s\S]+?)\\end\{\1\}/g, (_, __, expression: string) => {
        return `\n\n$$\n${expression.trim()}\n$$\n\n`;
      })
      // Standard LaTeX delimiters: \[ ... \] and \( ... \)
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression: string) => {
        return `\n\n$$\n${expression.trim()}\n$$\n\n`;
      })
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression: string) => {
        return `$${expression.trim()}$`;
      })
      // Fallback: literal brackets [ ... ] containing LaTeX commands often output by some LLMs
      .replace(/(?:^|\s)\[\s*(\\(?:text|frac|sum|sqrt|begin|int|mathbf|boldsymbol|alpha|beta|mu|sigma|theta|Delta|pi|[A-Za-z]+))([\s\S]+?)\s*\](?=\s|$)/g, (_, cmd, expression: string) => {
        return `\n\n$$\n${cmd}${expression}\n$$\n\n`;
      })
      // Fallback: literal parentheses ( ... ) containing LaTeX commands
      .replace(/(?:^|\s)\(\s*(\\(?:text|frac|sum|sqrt|begin|int|mathbf|boldsymbol|alpha|beta|mu|sigma|theta|Delta|pi|[A-Za-z]+))([\s\S]+?)\s*\)(?=\s|$)/g, (_, cmd, expression: string) => {
        return ` $${cmd}${expression}$ `;
      }),
  );
}

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
  return String(marked.parse(renderMath(normalizeMathDelimiters(source))));
}

export function escapeHtml(source: string): string {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
