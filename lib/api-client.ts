/**
 * API client for communicating with the FastAPI backend.
 * Replaces all Convex hooks (useQuery, useMutation, useAction)
 * with standard fetch calls authenticated via Clerk JWT.
 */

import { getApiBase } from "@/lib/api-base";

const API_BASE = getApiBase();

function buildHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ─── User APIs ───────────────────────────────────────────────────────────────

export async function createUser(
  data: { email: string; name: string; image_url: string },
  token?: string | null,
) {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`createUser failed: ${err}`);
  }
  return res.json();
}

export async function getUser(email: string, token?: string | null) {
  const res = await fetch(
    `${API_BASE}/api/users/me?email=${encodeURIComponent(email)}`,
    {
      headers: buildHeaders(token),
    },
  );
  if (!res.ok) return null;
  return res.json();
}

// ─── File APIs ───────────────────────────────────────────────────────────────

export interface FileRecord {
  id: number;
  fileId: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  storageKey?: string;
  status: string;
  transcript: string | null;
  durationSeconds: number | null;
  createdBy?: string;
  createdAt: string;
  timestamps?: MediaTimestamp[];
}

export interface MediaTimestamp {
  id: number;
  fileId?: string;
  start_time: number;
  end_time: number;
  text: string;
  topic: string;
}

export interface FileProcessingProgress {
  fileId: string;
  status: "processing" | "ready" | "failed" | string;
  phase: string;
  progress: number;
}

export async function uploadFile(
  file: File,
  fileName?: string | null,
  token?: string | null,
  onProgress?: (progress: number) => void,
): Promise<FileRecord> {
  const formData = new FormData();
  formData.append("file", file);
  const displayName = fileName?.trim();
  if (displayName) {
    formData.append("file_name", displayName);
  }

  return new Promise<FileRecord>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/files/upload`);
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      const text = xhr.responseText || "";
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`uploadFile failed: ${text || xhr.statusText}`));
        return;
      }
      try {
        onProgress?.(100);
        resolve(JSON.parse(text) as FileRecord);
      } catch (error) {
        reject(error);
      }
    };

    xhr.onerror = () => reject(new Error("uploadFile failed: network error"));
    xhr.onabort = () => reject(new Error("uploadFile failed: aborted"));
    xhr.send(formData);
  });
}

export async function getUserFiles(
  token?: string | null,
): Promise<FileRecord[]> {
  const res = await fetch(
    `${API_BASE}/api/files`,
    {
      headers: buildHeaders(token),
    },
  );
  if (!res.ok) return [];
  return res.json();
}

export async function getFileData(
  fileId: string,
  token?: string | null,
): Promise<FileRecord | null> {
  const res = await fetch(`${API_BASE}/api/files/${fileId}`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getFileProgress(
  fileId: string,
  token?: string | null,
): Promise<FileProcessingProgress> {
  const res = await fetch(`${API_BASE}/api/files/${fileId}/progress`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`getFileProgress failed: ${err}`);
  }
  return res.json();
}

export async function deleteFile(
  fileId: string,
  token?: string | null,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/files/${fileId}`, {
    method: "DELETE",
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`deleteFile failed: ${err}`);
  }
}

export interface UploadCountResponse {
  count: number;
  limit: number;
  remaining: number;
}

export async function getUploadCount(
  token?: string | null,
): Promise<UploadCountResponse> {
  const res = await fetch(`${API_BASE}/api/files/upload-count`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    return { count: 0, limit: 5, remaining: 5 };
  }
  return res.json();
}

// ─── Notes APIs ──────────────────────────────────────────────────────────────

export async function getNotes(
  fileId: string,
  token?: string | null,
): Promise<Array<{ id: number; fileId: string; note: string; createdBy?: string; updatedAt?: string }>> {
  const res = await fetch(`${API_BASE}/api/notes/${fileId}`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function saveNote(
  fileId: string,
  note: string,
  token?: string | null,
): Promise<void> {
  await fetch(`${API_BASE}/api/notes/${fileId}`, {
    method: "PUT",
    headers: buildHeaders(token),
    body: JSON.stringify({ note }),
  });
}

// ─── Search / AI APIs ────────────────────────────────────────────────────────

export async function searchDocuments(
  query: string,
  fileId: string,
  token?: string | null,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/search`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ query, file_id: fileId }),
  });
  if (!res.ok) return "";
  const data = await res.json();
  if (Array.isArray(data)) {
    return data.map((r: { text: string }) => r.text).join("\n\n");
  }
  return "";
}
