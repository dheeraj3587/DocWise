# DocWise — Architecture

## Overview

**DocWise** is an AI-powered document notebook that lets users upload PDFs, audio, and video files, then ask questions, take notes, and get AI-generated answers with citations and timestamps. It is a full-stack application with a Next.js frontend, a FastAPI backend, and several supporting services orchestrated via Docker Compose.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet / Browser                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │ :80 / :443
                               ▼
                        ┌─────────────┐
                        │    Nginx    │  Reverse proxy & static routing
                        └──────┬──────┘
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        ┌────────────┐  ┌────────────┐  ┌────────────┐
        │  Frontend  │  │  Backend   │  │   MinIO    │
        │  Next.js   │  │  FastAPI   │  │  (S3 API)  │
        │  :3000     │  │  :8000     │  │  :9000     │
        └────────────┘  └─────┬──────┘  └────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌────────────┐  ┌────────────┐  ┌────────────┐
       │ PostgreSQL │  │   Redis    │  │   Celery   │
       │  :5432     │  │  :6379     │  │   Worker   │
       └────────────┘  └────────────┘  └────────────┘
```

**Nginx** is the single public entry point. It routes:
- `/` → Frontend (Next.js)
- `/api/*` → Backend (FastAPI)
- `/storage/*` → MinIO (presigned file downloads)

---

## Services

| Service      | Technology             | Role                                                    |
|-------------|------------------------|---------------------------------------------------------|
| **Frontend** | Next.js 16, React 19   | App Router SPA — landing page, dashboard, workspace     |
| **Backend**  | FastAPI (async Python)  | REST API — files, chat, search, notes, users            |
| **Worker**   | Celery                 | Background tasks — PDF parsing, media transcription, embedding |
| **Database** | PostgreSQL 16          | Persistent storage for users, files, notes, timestamps  |
| **Cache**    | Redis 7                | Response caching, rate-limit counters, Celery broker    |
| **Storage**  | MinIO (S3-compatible)  | Object storage for uploaded PDFs, audio, and video      |
| **Nginx**    | Nginx 1.27             | Reverse proxy, TLS termination, SSE streaming support   |

---

## Frontend

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion

### Route Groups

| Route Group      | Path                        | Purpose                                    |
|-----------------|-----------------------------|--------------------------------------------|
| `(auth)`        | `/sign-in`, `/sign-up`      | Clerk-powered authentication pages         |
| `(dashboard)`   | `/dashboard`                | File list, upload, and management          |
| `(workspace)`   | `/workspace/[fileId]`       | Split-pane document viewer + editor + chat |
| `api`           | `/api/ai-stream`            | Server-side AI streaming proxy (Next.js Route Handler) |
| Root            | `/`                         | Landing page                               |

### Key Components

- **Dashboard** — Lists user files with upload capability (`file-upload.tsx`), sidebar navigation, and header.
- **Workspace** — Resizable two-panel layout:
  - **Left panel** toggles between a **TipTap rich-text editor** (notes) and an **AI Chat panel**.
  - **Right panel** displays the document — a **PDF viewer** for PDFs or a **media player** (audio/video) with clickable timestamps.
- **ChatPanel** — Streams AI responses via SSE from the backend `/api/chat/ask` endpoint. Supports "Deep Mode" toggle (GPT-5-mini vs GPT-5.2).
- **API Client** (`lib/api-client.ts`) — Centralized fetch wrapper for all backend calls, authenticated via Clerk JWT.

### Authentication

Clerk is used for user authentication. The Next.js middleware (`middleware.ts`) protects all routes except the landing page, sign-in/sign-up, and static assets. JWTs are forwarded to the backend on every API call.

---

## Backend

**Stack:** FastAPI (async), SQLAlchemy 2.0, LangChain, Azure OpenAI, FAISS, Celery, boto3 (MinIO)

### API Routers

All routes are prefixed with `/api/`.

| Router    | Prefix           | Endpoints                                      | Purpose                                    |
|-----------|------------------|-------------------------------------------------|--------------------------------------------|
| `files`   | `/api/files`     | `POST /upload`, `GET /`, `GET /{id}`, `DELETE /{id}`, `GET /upload-count` | File CRUD + upload with daily limits       |
| `chat`    | `/api/chat`      | `POST /ask`, `POST /summarize`                  | RAG Q&A and document summarization (SSE)   |
| `search`  | `/api/search`    | `POST /`                                        | Vector similarity search                   |
| `notes`   | `/api/notes`     | `GET /{fileId}`, `PUT /{fileId}`, `DELETE /{fileId}` | Per-file note CRUD (upsert)               |
| `users`   | `/api/users`     | `POST /`, `GET /me`, `PATCH /{email}`           | User profile creation and management       |
| `health`  | `/api/health`    | `GET /`                                         | Health check                               |

### Services

| Service                | File                              | Responsibility                                                |
|-----------------------|-----------------------------------|---------------------------------------------------------------|
| `AIService`           | `services/ai_service.py`          | LLM calls (chat streaming, summarization) via Azure OpenAI    |
| `EmbeddingService`    | `services/embedding_service.py`   | Text embedding (Azure OpenAI `text-embedding-3-large`) + FAISS ingestion/search |
| `PDFService`          | `services/pdf_service.py`         | PDF text extraction and chunking (PyPDF + LangChain splitter) |
| `TranscriptionService`| `services/transcription_service.py`| Audio/video transcription via Azure Whisper API               |
| `TimestampService`    | `services/timestamp_service.py`   | LLM-based topic extraction from transcript segments           |
| `StorageService`      | `services/storage_service.py`     | MinIO file upload/download/delete with presigned URL generation |

### Database Models (SQLAlchemy)

| Model             | Table               | Key Fields                                                    |
|------------------|---------------------|---------------------------------------------------------------|
| `User`           | `users`             | `email` (unique), `name`, `image_url`                         |
| `File`           | `files`             | `file_id` (UUID), `file_name`, `file_type`, `storage_key`, `created_by`, `transcript`, `status` |
| `Note`           | `notes`             | `file_id` (FK), `note` (text), `created_by`                  |
| `MediaTimestamp`  | `media_timestamps`  | `file_id` (FK), `start_time`, `end_time`, `text`, `topic`    |

Tables are auto-created on startup via `Base.metadata.create_all`.

### Core Modules

| Module         | File                   | Purpose                                                  |
|---------------|------------------------|----------------------------------------------------------|
| `config`      | `core/config.py`       | Pydantic Settings — all env vars in one place            |
| `security`    | `core/security.py`     | Clerk JWT verification + API key auth                    |
| `authz`       | `core/authz.py`        | File ownership checks (multi-tenant isolation)           |
| `rate_limit`  | `core/rate_limit.py`   | Per-user, per-endpoint rate limiting (Redis + memory fallback) |
| `cache`       | `core/cache.py`        | JSON response caching with TTL (Redis + memory fallback) |

---

## RAG Pipeline (Retrieval-Augmented Generation)

The core AI feature follows a standard RAG architecture:

```
Upload                        Query
  │                             │
  ▼                             ▼
┌──────────┐              ┌──────────────┐
│  Parse   │              │  Embed Query │
│  (PDF /  │              │  (Azure      │
│  Whisper)│              │   OpenAI)    │
└────┬─────┘              └──────┬───────┘
     │                           │
     ▼                           ▼
┌──────────┐              ┌──────────────┐
│  Chunk   │              │ FAISS Search │
│  Text    │              │ (top-K)      │
└────┬─────┘              └──────┬───────┘
     │                           │
     ▼                           ▼
┌──────────┐              ┌──────────────┐
│  Embed   │              │  LLM Answer  │
│  Chunks  │              │  (streaming  │
│  (Azure) │              │   SSE)       │
└────┬─────┘              └──────────────┘
     │
     ▼
┌──────────┐
│  Store   │
│  FAISS   │
│  Index   │
└──────────┘
```

### Ingestion (Background — Celery Worker)

1. **PDF:** Download from MinIO → extract text (PyPDF) → chunk (RecursiveCharacterTextSplitter, 1000 chars / 200 overlap) → embed (Azure OpenAI `text-embedding-3-large`) → store per-file FAISS index to disk.
2. **Audio/Video:** Download from MinIO → transcribe (Azure Whisper) → group segments into ~500-char chunks with timestamps → embed → store FAISS index. Also uses LLM to extract topic-level timestamps stored in the `media_timestamps` table.

### Query

1. User sends a question → embed the query → FAISS similarity search (top-10 chunks) → construct prompt with context → stream LLM response via SSE.
2. For media files, timestamp references (`[MM:SS]`) are included in the LLM response so users can jump to relevant parts.

### Vector Store

FAISS indices are stored per-file on disk (`/app/faiss_indices/{file_id}.index` + `.meta.json`). Each index uses `IndexFlatL2` with 3072-dimensional vectors (matching `text-embedding-3-large`).

---

## Background Processing (Celery)

| Task             | Trigger         | Action                                                          |
|-----------------|-----------------|-----------------------------------------------------------------|
| `process_pdf`   | File upload (PDF) | Download → parse → chunk → embed → update status to `ready`    |
| `process_media` | File upload (audio/video) | Download → transcribe → chunk → embed → extract timestamps → update status |

Redis serves as both the Celery broker and result backend. Tasks are configured with `max_retries=3` and `acks_late=True` for reliability.

---

## Authentication & Authorization

### Authentication (two methods)

1. **Clerk JWT** — Primary method. Frontend sends `Authorization: Bearer <token>`. Backend verifies via Clerk's JWKS endpoint (cached 1 hour).
2. **API Key** — Machine-to-machine. Send `X-API-Key: <key>` header. Keys configured via `API_KEYS` env var.

### Authorization

- **File ownership:** Every file has a `created_by` field (user email). The `assert_file_owner()` helper ensures only the file creator can access, modify, or delete it.
- **User profiles:** Users can only create/update their own profile (email in JWT must match).

---

## Rate Limiting & Caching

### Rate Limits (per user, per minute)

| Endpoint    | Limit |
|-------------|-------|
| General     | 120   |
| Upload      | 20    |
| Chat        | 30    |
| Summarize   | 10    |
| Search      | 60    |
| Users       | 60    |
| Notes       | 120   |

Fixed-window rate limiting backed by Redis. Falls back to in-memory counters if Redis is unavailable.

### Response Caching

| Cache Key              | TTL      |
|-----------------------|----------|
| Chat answers          | 30 min   |
| Summaries             | 30 min   |
| Search results        | 10 min   |

Caching is backed by Redis with an in-memory fallback. Cache keys are scoped by `file_id` and query content.

---

## Upload Guardrails

| Limit                        | Default |
|-----------------------------|---------|
| Max file size                | 50 MB   |
| Max uploads per user per day | 5       |
| Allowed file types           | PDF, MP3, WAV, M4A, MP4, WebM, OGG |

---

## Deployment

### Docker Compose (7 services)

```
docker compose up --build -d
```

All services communicate over an internal Docker network. Only Nginx port 80 (and optionally 443) is exposed publicly.

### Persistent Volumes

| Volume       | Purpose                          |
|-------------|----------------------------------|
| `pgdata`    | PostgreSQL data                  |
| `minio_data`| Uploaded files                   |
| `faiss_data`| FAISS vector indices             |

### Production (DigitalOcean)

Recommended: Ubuntu 22.04 droplet, 2 vCPU / 4 GB RAM minimum. Nginx handles TLS termination. Optional Let's Encrypt SSL via Certbot.

---

## Directory Structure

```
DocWise/
├── app/                          # Next.js App Router
│   ├── (auth)/                   #   Clerk sign-in / sign-up
│   ├── (dashboard)/              #   Dashboard — file list & upload
│   │   └── components/           #     Header, sidebar, file-upload
│   ├── (workspace)/              #   Workspace — document viewer + editor + AI chat
│   │   └── components/           #     ChatPanel, TextEditor, PdfViewer, MediaPlayer
│   ├── api/ai-stream/            #   Next.js Route Handler (AI proxy)
│   └── page.tsx                  #   Landing page
├── components/ui/                # shadcn/ui primitives (Button, Dialog, etc.)
├── lib/                          # API client, hooks, utilities
├── backend/
│   ├── core/                     #   Config, security, authz, rate limiting, cache
│   ├── models/                   #   SQLAlchemy ORM models
│   ├── routers/                  #   FastAPI route handlers
│   ├── services/                 #   AI, embedding, PDF, transcription, storage
│   ├── tasks/                    #   Celery background workers
│   ├── vector_store/             #   FAISS index management
│   └── tests/                    #   pytest test suite
├── nginx/                        # Nginx configuration
├── docker-compose.yml            # Full stack orchestration
├── Dockerfile                    # Frontend container
└── backend/Dockerfile            # Backend container
```
