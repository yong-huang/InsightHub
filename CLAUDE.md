# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InsightHub is a client-side React SPA for browsing, searching, and quizzing against HTML learning documents from two sources: MindInsight (academic, film, finance, history, literature, philosophy) and TechInsight (AI, algorithms, cloud, data-visualization, dell, infrastructure, programming). It connects to a local Qwen3.5-27B-4bit model for AI-generated quizzes. Supports text annotations (highlights and comments) with LAN sync across clients.

## Commands

```bash
cd insighthub
npm run dev       # Start Vite dev server (serves docs via documentDiscovery plugin at /dev-docs/)
npm run build     # TypeScript check + Vite build (copies docs to public/docs/ via prebuild)
npm run lint      # ESLint
npm run preview   # Preview production build
```

No test framework is configured. There is no linter auto-fix script.

## Architecture

**Stack**: Vite + React 19 + TypeScript, Zustand 5 for state, FlexSearch for full-text search, Lucide React for icons. Pure CSS with custom properties for theming (light/dark). No UI component library.

**Path alias**: `@/` maps to `src/`.

**Document loading strategy**: Documents are discovered dynamically via a Vite plugin (`vite-plugins/documentDiscovery.ts`) that scans the source directories. At startup, `useInitializeApp` fetches the manifest from `/api/documents`, parses each HTML file via DOMParser (`src/utils/htmlParser.ts`), and stores results in `documentStore`. Documents are loaded in batches with progress tracking. Reading state (read count, timestamps) persists in localStorage via `storageService` and syncs to server-side JSON files for LAN access.

**Dev vs Production document URLs**: In dev, documents are served from sibling project directories (`../MindInsight/`, `../TechInsight/`) via a custom `documentDiscovery` Vite plugin that provides `/dev-docs/` and `/api/documents` endpoints (configured in `vite.config.ts`). In production, `scripts/copy-docs.ts` copies them to `public/docs/` before the build. The `useDocumentUrl` hook switches between these automatically using `import.meta.env.DEV`.

**Absolute paths in vite.config.ts and useDocumentUrl.ts**: Both hardcode `/Users/hyhit/Desktop/workspace/projects/MindInsight` and `TechInsight` — these must be updated if the project moves.

### Data Flow

```
useInitializeApp (hook)
  → preferenceStore.setTheme (apply theme to <html>)
  → documentStore.initializeDocuments (fetch /api/documents → parse HTMLs → build FlexSearch index)
  → tagStore.loadTags / searchStore.loadHistory / quizStore.loadHistory
  → annotationStore.loadAnnotations (restore from localStorage + merge from server)
```

### Routing (React Router v7, `App.tsx`)

All routes are wrapped in `<Layout />`. Key routes:
- `/` — Home dashboard with stats and category overview
- `/mindinsight`, `/techinsight` — Source-level category listing
- `/mindinsight/:category`, `/techinsight/:category` — Filtered by category
- `/doc/:docId` — Document reader (iframe embed) with annotation support
- `/search` — Search results
- `/quiz/:quizId` — AI quiz session (quizId is a composite of docId + timestamp)
- `/tag/:tagId` — Documents filtered by tag
- `/notes` — Notes management page (all comments across documents)
- `/settings` — AI model config, quiz preferences

### Zustand Stores (`src/stores/`)

- **documentStore** — Document Map, loading state, filters, stats. Fetches/parses docs, marks read.
- **searchStore** — Query state, results, search history. Delegates to FlexSearch via `searchService`.
- **quizStore** — Quiz sessions, attempts, AI grading results, persistence.
- **tagStore** — Tag CRUD and document-tag associations. Syncs to server.
- **annotationStore** — Annotations (highlights, comments), persists to localStorage + server.
- **preferenceStore** — Theme, quiz settings, sidebar state, active workspace.

### AI Quiz System (`src/services/aiService.ts`, `quizService.ts`)

Calls local OpenAI-compatible API (configurable, default `http://127.0.0.1:7001/v1`). Uses streaming (SSE) for quiz generation via server-side proxy (`/api/ai/chat/completions`). Generates multiple-choice and true/false questions only, scored on a 100-point scale. 60-second timeout per AI call.

### Annotation System (`src/hooks/useAnnotationIframe.ts`, `src/utils/xpath.ts`)

Text selection in iframe is detected via `contentWindow.getSelection()`. Ranges are serialized to XPath + offsets for persistence. On restore, XPath is resolved first, with text search as fallback. Cross-element ranges use `splitText` + wrap to avoid DOM corruption.

### LAN Sync

The Vite plugin provides REST endpoints that persist to `.insighthub-*.json` files:
- `/api/tags`, `/api/annotations`, `/api/quizzes`, `/api/quiz-history`
- `/api/read-meta`, `/api/read-history`
- `/api/ai/config` (editable AI settings)

All stores load from localStorage first, then merge from server on startup.

### CSS Theming

CSS custom properties defined in `src/styles/globals.css`. Light theme is default. Dark theme toggled via `data-theme="dark"` on `<html>`. Design uses blue-purple gradient primary, with green/orange/red/yellow/purple accents. Card radius 12px, shadow system with sm/md/lg levels.

## Key Files

- `vite.config.ts` — Vite config with `@/` alias and `documentDiscovery` plugin
- `vite-plugins/documentDiscovery.ts` — Vite plugin for document discovery, API endpoints, AI proxy
- `src/utils/documentManifest.ts` — Dynamic document manifest (fetches from `/api/documents`)
- `src/utils/htmlParser.ts` — HTML → Document metadata extraction
- `src/utils/categoryMap.ts` — Category definitions and lookup functions
- `src/utils/xpath.ts` — Range ↔ XPath serialization for annotation positioning
- `src/services/aiService.ts` — AI API client (OpenAI-compatible, SSE streaming)
- `src/services/storageService.ts` — localStorage wrapper with `insighthub:` key prefix
- `src/scripts/copy-docs.ts` — Build-time script that copies document directories

## Design Documents

`docs/` directory contains Chinese-language specs:
- `PRD.md` — Product requirements with feature prioritization and version plan
- `DESIGN.md` — Technical design with architecture and data flow
- `TEST_PLAN.md` — Test plan
