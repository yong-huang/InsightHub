# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InsightHub is a client-side React SPA for browsing, searching, and quizzing against HTML learning documents from two sources: MindInsight (academic, film, literature, philosophy) and TechInsight (AI, algorithms, cloud, infrastructure, programming). It connects to a local Qwen3.5-27B-4bit model for AI-generated quizzes.

## Commands

```bash
cd insighthub
npm run dev       # Start Vite dev server (serves docs via @fs from sibling directories)
npm run build     # TypeScript check + Vite build (copies docs to public/docs/ via prebuild)
npm run lint      # ESLint
npm run preview   # Preview production build
```

No test framework is configured. There is no linter auto-fix script.

## Architecture

**Stack**: Vite + React 19 + TypeScript, Zustand 5 for state, FlexSearch for full-text search, Lucide React for icons. Pure CSS with custom properties for theming (light/dark). No UI component library.

**Path alias**: `@/` maps to `src/`.

**Document loading strategy**: Documents are listed in a static manifest (`src/utils/documentManifest.ts`). At startup, `useInitializeApp` fetches each HTML file, parses it via DOMParser (`src/utils/htmlParser.ts`), and stores results in `documentStore`. Documents are loaded in batches with progress tracking. Reading state (read count, timestamps) persists in localStorage via `storageService`.

**Dev vs Production document URLs**: In dev, documents are served from sibling project directories (`../MindInsight/`, `../TechInsight/`) via Vite's `@fs` protocol (configured in `vite.config.ts` `server.fs.allow`). In production, `scripts/copy-docs.ts` copies them to `public/docs/` before the build. The `useDocumentUrl` hook switches between these automatically using `import.meta.env.DEV`.

**Absolute paths in vite.config.ts and useDocumentUrl.ts**: Both hardcode `/Users/hyhit/Desktop/workspace/projects/MindInsight` and `TechInsight` — these must be updated if the project moves.

### Data Flow

```
useInitializeApp (hook)
  → preferenceStore.setTheme (apply theme to <html>)
  → documentStore.initializeDocuments (fetch manifest → parse HTMLs → build FlexSearch index)
  → tagStore.loadTags / searchStore.loadHistory / quizStore.loadHistory (restore from localStorage)
```

### Routing (React Router v7, `App.tsx`)

All routes are wrapped in `<Layout />`. Key routes:
- `/` — Home dashboard with stats and category overview
- `/mindinsight`, `/techinsight` — Source-level category listing
- `/mindinsight/:category`, `/techinsight/:category` — Filtered by category
- `/doc/:docId` — Document reader (iframe embed)
- `/search` — Search results
- `/quiz/:quizId` — AI quiz session
- `/tag/:tagId` — Documents filtered by tag

### Zustand Stores (`src/stores/`)

- **documentStore** — Document Map, loading state, filters, stats. Fetches/parses docs, marks read.
- **searchStore** — Query state, results, search history. Delegates to FlexSearch via `searchService`.
- **quizStore** — Quiz sessions, attempts, AI grading results.
- **tagStore** — Tag CRUD and document-tag associations.
- **preferenceStore** — Theme and quiz settings.

### AI Quiz System (`src/services/aiService.ts`, `quizService.ts`)

Calls local OpenAI-compatible API at `http://127.0.0.1:7001/v1` (model: Qwen3.5-27B-4bit). Generates multiple-choice, true/false, and short-answer questions from document content. Uses mixed grading: objective questions scored locally, short answers sent to AI. 60-second timeout per AI call.

### CSS Theming

CSS custom properties defined in `src/styles/globals.css`. Dark theme toggled via `data-theme="dark"` on `<html>`. Design uses blue-purple gradient primary, with green/orange/red/yellow accents. Card radius 12px, shadow system with sm/md/lg levels.

## Key Files

- `insighthub/vite.config.ts` — Vite config with `@/` alias and `fs.allow` for document directories
- `insighthub/src/utils/documentManifest.ts` — Static list of all ~124 HTML documents
- `insighthub/src/utils/htmlParser.ts` — HTML → Document metadata extraction
- `insighthub/src/utils/categoryMap.ts` — Category definitions and lookup functions
- `insighthub/src/services/aiService.ts` — AI API client (OpenAI-compatible format)
- `insighthub/src/services/storageService.ts` — localStorage wrapper with `insighthub:` key prefix
- `insighthub/scripts/copy-docs.ts` — Build-time script that copies document directories

## Design Documents

`docs/` directory contains Chinese-language specs:
- `PRD.md` — Product requirements with feature prioritization
- `DESIGN.md` — Technical design with architecture diagrams and data models
- `TEST_PLAN.md` — Test plan
