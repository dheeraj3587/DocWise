<div align="center">

# 📄 DocWise

### Your intelligent notebook for any document

*Upload PDFs, audio, and video — ask questions, take notes, and get AI-powered answers with citations and timestamps.*

[![Star on GitHub](https://img.shields.io/github/stars/dheeraj3587/DocWise?style=social)](https://github.com/dheeraj3587/DocWise)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-05998b)](https://fastapi.tiangolo.com/)

[Live Demo](https://docwise.vercel.app) • [Report Bug](https://github.com/dheeraj3587/DocWise/issues) • [Request Feature](https://github.com/dheeraj3587/DocWise/issues)

</div>

---

## ✨ Features

- **📄 PDF Intelligence** — Upload PDFs and ask questions. Get grounded answers from your document content.
- **🎙️ Audio & Video Support** — Upload audio/video files. Automatic transcription with clickable timestamps.
- **🤖 AI Chat (RAG)** — Context-aware Q&A powered by Azure OpenAI with retrieval-augmented generation.
- **📝 Rich Text Notes** — Full WYSIWYG editor (TipTap) with formatting, highlights, and AI-assisted writing.
- **⚡ AI Summarization** — One-click document summaries streamed directly into your notes.
- **🧠 Deep Mode** — Toggle between fast (GPT-5-mini) and deep reasoning (GPT-5.2) modes.
- **🔐 Secure Auth** — Clerk-powered authentication with JWT + API key support.
- **📦 Fully Dockerized** — One command to spin up the entire stack.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS |
| **Backend** | FastAPI (async), PostgreSQL, Celery |
| **AI/RAG** | LangChain, Azure OpenAI, FAISS vector search |
| **Auth** | Clerk JWT + API key auth |
| **Storage** | MinIO (S3-compatible) |
| **Cache** | Redis (response caching + rate limiting) |
| **Editor** | TipTap (rich text with AI integration) |
| **UI** | shadcn/ui, Lucide icons, Framer Motion |

---

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local frontend dev)
- [Clerk](https://clerk.com/) account
- Azure OpenAI API access

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/dheeraj3587/DocWise.git
   cd DocWise
   ```

2. **Configure environment**

   Create a `.env` file in the root:
   ```env
   # Clerk Auth
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
   CLERK_SECRET_KEY=sk_...
   CLERK_JWKS_URL=https://your-clerk.clerk.accounts.dev/.well-known/jwks.json
   CLERK_ISSUER=https://your-clerk.clerk.accounts.dev

   # Azure OpenAI
   AZURE_OPENAI_API_KEY=your-key
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
   AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-5-mini
   AZURE_OPENAI_DEEP_DEPLOYMENT=gpt-5.2-chat

   # Azure OpenAI - Embeddings
   AZURE_OPENAI_EMBEDDING_API_KEY=your-key
   AZURE_OPENAI_EMBEDDING_ENDPOINT=https://your-resource.openai.azure.com/

   # Azure OpenAI - Whisper (transcription)
   AZURE_OPENAI_WHISPER_API_KEY=your-key
   AZURE_OPENAI_WHISPER_ENDPOINT=https://your-resource.openai.azure.com/
   ```

3. **Start everything**
   ```bash
   docker compose up --build -d
   ```

4. **Open** → [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
DocWise/
├── app/                       # Next.js App Router
│   ├── (auth)/               # Sign in / Sign up (Clerk)
│   ├── (dashboard)/          # Dashboard + file management
│   ├── (workspace)/          # Document workspace (editor + viewer + AI chat)
│   ├── api/                  # API routes (AI stream)
│   └── page.tsx              # Landing page
├── components/               # Shared React components
│   └── ui/                   # shadcn/ui primitives
├── backend/                  # FastAPI backend
│   ├── routers/              # API endpoints (chat, files, notes, search, users)
│   ├── services/             # AI, embedding, storage, PDF, transcription
│   ├── models/               # SQLAlchemy models
│   ├── tasks/                # Celery workers (PDF processing, media transcription)
│   ├── core/                 # Config, auth, rate limiting, caching
│   └── vector_store/         # FAISS index management
├── lib/                      # Frontend utilities & API client
├── docker-compose.yml        # Full stack orchestration
└── Dockerfile                # Frontend container
```

---

## 🔒 Authentication

### Clerk JWT (default)
```
Authorization: Bearer <clerk-jwt-token>
```

### API Key (machine-to-machine)
```
X-API-Key: your-api-key
```

Configure keys via `API_KEYS` env var (comma-separated or JSON array).

---

## ⚙️ Configuration

### Rate Limits (per minute)

| Endpoint | Default |
|----------|---------|
| General | 120 |
| Upload | 20 |
| Chat | 30 |
| Summarize | 10 |
| Search | 60 |

### Response Caching

| Setting | Default |
|---------|---------|
| Chat TTL | 30 min |
| Summary TTL | 30 min |
| Search TTL | 10 min |

All configurable via environment variables. See `backend/core/config.py` for the full list.

---

## 📋 Known Limitations

- **Large files** — Very large PDFs may hit token limits during embedding
- **Context window** — Answers are based on top-K relevant chunks, not the entire document
- **File formats** — Supported: PDF, MP3, WAV, M4A, MP4, WebM
- **Transcription** — Depends on Azure Whisper API availability

---

## 👤 Author

**Dheeraj Joshi** — [@dheeraj3587](https://github.com/dheeraj3587)

---

<div align="center">

**[⬆ Back to Top](#-docwise)**

Made with ❤️ by [Dheeraj Joshi](https://github.com/dheeraj3587)

</div>
