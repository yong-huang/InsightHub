# Deployment Guide

## Overview

InsightHub is a static single-page application. It can be deployed to any static file server or served locally. The only external dependency is an optional local LLM for AI quiz generation.

## Prerequisites

- Node.js >= 18 (for building)
- A local LLM server with OpenAI-compatible API (optional, for AI quizzes)

## Build

### 1. Configure Workspaces

Edit `data/.insighthub-workspaces.json` to define your document workspaces:

```json
[
  {
    "id": "myworkspace",
    "label": "MyWorkspace",
    "icon": "FolderOpen",
    "path": "../MyDocuments",
    "prefix": "my"
  }
]
```

Paths are relative to the `insighthub/` directory. You can also add and manage workspaces from the Settings page (`/settings`) at runtime.

### 2. Install Dependencies

```bash
cd insighthub
npm install
```

### 3. Build

```bash
npm run build
```

This runs:
1. `prebuild` — Copies HTML documents from source directories into `public/docs/` and generates `public/manifest.json`
2. `tsc -b` — TypeScript type checking
3. `vite build` — Produces static files in `dist/`

The output in `dist/` is fully self-contained — all document HTML files are embedded.

### 4. Serve

```bash
npx serve dist
# or
npx http-server dist -p 3060
```

Or configure any static file server (nginx, Caddy, etc.) to serve `dist/`.

## Deployment Options

### Option A: Local Development Server

For personal use on a single machine:

```bash
npm run dev
```

The Vite dev server serves documents directly from the source directories (no copy needed). LAN sync endpoints are available at `/api/*`.

### Option B: Static File Server

For deployment to a simple HTTP server:

```bash
npm run build
# Deploy dist/ to your server
```

Notes:
- LAN sync endpoints (`/api/*`) are **not available** in static mode — the Vite plugin only runs during development.
- Data persists in the browser's localStorage only (no cross-device sync).
- To re-enable LAN sync in production, you would need a separate API server that provides the same REST endpoints.

### Option C: LAN Deployment with Sync

For sharing across devices on a local network:

1. Build the app: `npm run build`
2. Serve `dist/` with a server that also provides the sync API endpoints:
   - `/api/documents` — Document manifest
   - `/api/annotations` — Annotation CRUD (GET/POST)
   - `/api/tags` — Tag CRUD
   - `/api/quizzes`, `/api/quiz-history` — Quiz data
   - `/api/read-meta`, `/api/read-history` — Reading state
   - `/api/ai/chat/completions` — AI proxy (optional)
3. Each client loads from localStorage first, then merges from the server.

### Option D: Docker (Self-Hosted)

Example Dockerfile for a self-contained deployment:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY insighthub/package*.json ./
RUN npm ci
COPY insighthub/ ./
COPY your-docs/ /docs/
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

```bash
docker build -t insighthub .
docker run -p 3060:80 insighthub
```

## AI Quiz Setup (Optional)

AI quiz generation requires a local LLM server with an OpenAI-compatible API. The default configuration points to `http://127.0.0.1:7001/v1`.

### Supported Servers

- [llama.cpp](https://github.com/ggerganov/llama.cpp) — `./server -m model.gguf --port 7001`
- [Ollama](https://ollama.ai) — `OLLAMA_HOST=0.0.0.0:7001 ollama serve`
- [vLLM](https://github.com/vllm-project/vllm) — `python -m vllm.entrypoints.openai.api_server --port 7001`

### Configuration

Users can change the AI endpoint from the Settings page (`/settings`). The settings are persisted in localStorage and synced to `/api/ai/config`.

If no LLM server is running, the app works normally — only the quiz generation feature will fail with a timeout error.

## Environment Notes

### Document Source Directories

Document source directories contain HTML files organized as:

```
your-workspace/
├── category/
│   ├── article-1.html
│   └── article-2.html
├── another-category/
│   └── ...
└── ...
```

The Vite plugin scans workspace directories recursively, extracting metadata (title, sections, word count) from each HTML file. Workspace paths are configured in `data/.insighthub-workspaces.json`.

### Hardcoded Paths

There are no hardcoded document paths. All workspace directories are configured via `data/.insighthub-workspaces.json`. The Vite plugin and build scripts resolve paths relative to the project root.

### Browser Compatibility

Tested on modern Chromium-based browsers (Chrome, Edge). Firefox and Safari should work but are not actively tested.

### Data Storage

All user data is stored in the browser's localStorage under the `insighthub:` key prefix. This includes:
- Document read state
- Annotations
- Quiz history
- Tags
- Flashcards (spaced repetition)
- Achievements
- User preferences

There is no account system — each browser profile has its own independent dataset.

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Documents not loading | Check that source directories exist at the configured paths |
| AI quiz fails | Verify the LLM server is running at the configured URL |
| Annotations not restoring | The document HTML may have changed; fuzzy fallback will attempt text matching |
| Flashcards show HTML | Existing cards are auto-migrated on load; clear localStorage if issues persist |
| LAN sync not working | Sync endpoints are only available in dev mode (`npm run dev`) |
