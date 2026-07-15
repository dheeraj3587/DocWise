export interface SSEMessage<T = unknown> {
  id?: string;
  event?: string;
  data: T;
}

export async function* readSSE<T = unknown>(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEMessage<T>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const parsed = parseFrame<T>(frame);
        if (parsed) yield parsed;
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const parsed = parseFrame<T>(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame<T>(frame: string): SSEMessage<T> | null {
  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of frame.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const separator = rawLine.indexOf(":");
    const field = separator < 0 ? rawLine : rawLine.slice(0, separator);
    const rawValue = separator < 0 ? "" : rawLine.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "id") id = value;
    if (field === "event") event = value;
    if (field === "data") dataLines.push(value);
  }

  if (!dataLines.length) return null;
  const payload = dataLines.join("\n");
  try {
    return { id, event, data: JSON.parse(payload) as T };
  } catch {
    return { id, event, data: payload as T };
  }
}
