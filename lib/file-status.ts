/**
 * Single source of truth for how a file's backend `status` reads in the UI.
 *
 * The backend emits `processing` | `ready` | `failed`. Surfaces used to treat
 * "not processing" as "ready", which made failed uploads look openable.
 */

export type FileStatus = "processing" | "ready" | "failed";

export function normalizeFileStatus(status?: string | null): FileStatus {
  if (status === "processing" || status === "pending" || status === "queued") {
    return "processing";
  }
  if (status === "failed" || status === "error") return "failed";
  return "ready";
}

export function isFileReady(status?: string | null) {
  return normalizeFileStatus(status) === "ready";
}

export function isFileProcessing(status?: string | null) {
  return normalizeFileStatus(status) === "processing";
}

const STATUS_LABEL: Record<FileStatus, string> = {
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_DETAIL: Record<FileStatus, string> = {
  processing: "Extracting text",
  ready: "Ready to chat",
  failed: "Processing failed",
};

export function fileStatusLabel(status?: string | null) {
  return STATUS_LABEL[normalizeFileStatus(status)];
}

export function fileStatusDetail(status?: string | null) {
  return STATUS_DETAIL[normalizeFileStatus(status)];
}
