# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InsightHub is a client-side React SPA for browsing, searching, and quizzing against HTML learning documents from two sources: MindInsight (academic, film, finance, history, literature, philosophy) and TechInsight (AI, algorithms, cloud, data-visualization, dell, infrastructure, vmware, programming). It connects to a local Qwen3.5-27B-4bit model for AI-generated quizzes. Features include text annotations (highlights and comments), spaced repetition flashcards, knowledge graph, achievements, and LAN sync across clients.

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
  → flashcardStore.loadCards (restore from localStorage, migrate if needed)
  → flashcardStore.generateCardsFromAnnotations (auto-create flashcards from annotations)
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
- `/notes` — Notes management page (all comments across documents, grouped by doc)
- `/stats` — Data statistics with charts (reading heatmap, category radar, quiz performance, etc.)
- `/read-later` — Read-later reading list
- `/achievements` — Achievement system with unlock tracking
- `/knowledge-graph` — Interactive knowledge graph visualization
- `/my-map` — Personal knowledge map (user's engagement metrics)
- `/learning-path` — Learning path visualization
- `/spaced-repetition` — Spaced repetition flashcard review (SM-2 algorithm)
- `/settings` — AI model config, quiz preferences

### Zustand Stores (`src/stores/`)

- **documentStore** — Document Map, loading state, filters, stats. Fetches/parses docs, marks read.
- **searchStore** — Query state, results, search history. Delegates to FlexSearch via `searchService`.
- **quizStore** — Quiz sessions, attempts, AI grading results, persistence. Supports concurrent generation per document.
- **tagStore** — Tag CRUD and document-tag associations. Syncs to server.
- **annotationStore** — Annotations (highlights, comments), persists to localStorage + server. Marks flashcards as source-deleted on removal.
- **preferenceStore** — Theme, quiz settings, sidebar state, active workspace.
- **flashcardStore** — Flashcards with SM-2 scheduling, auto-generation from annotations, workspace filtering.

### AI Quiz System (`src/services/aiService.ts`, `quizService.ts`)

Calls local OpenAI-compatible API (configurable, default `http://127.0.0.1:7001/v1`). Uses streaming (SSE) for quiz generation via server-side proxy (`/api/ai/chat/completions`). Generates multiple-choice and true/false questions only, scored on a 100-point scale. 60-second timeout per AI call. Supports concurrent quiz generation for different documents.

### Annotation System (`src/hooks/useAnnotationIframe.ts`, `src/utils/xpath.ts`)

Text selection in iframe is detected via `contentWindow.getSelection()`. Ranges are serialized to XPath + offsets for persistence. On restore, XPath is resolved first, with fuzzy text search as fallback. Cross-element ranges use `splitText` + wrap to avoid DOM corruption. Clicking on highlighted text in the iframe opens an `AnnotationPopup` for viewing/editing comments. `trimRangeEdges` removes trailing whitespace from ranges before serialization.

### Spaced Repetition System (`src/services/spacedRepetition.ts`, `src/stores/flashcardStore.ts`)

Converts annotations into Anki-style flashcards with SM-2 algorithm scheduling:
- **Card creation**: Auto-generated from annotations (highlights → truncated front + full back; comments → highlight text front + comment back). Annotation text is stripped of HTML tags via `stripHtml()`.
- **SM-2 scheduling**: grade 0-5, intervals: 1→6→N×efactor days. Failed cards (grade<3) reset to interval=1.
- **Workspace isolation**: Cards are filtered by active workspace via document source.
- **Source deletion tracking**: When an annotation is deleted, the corresponding flashcard is marked `sourceDeleted: true` and displayed grayed-out in the list view.
- **Migration**: On load, existing cards with HTML in text fields are auto-cleaned and re-truncated.
- **Keyboard shortcuts**: Space/Enter to flip, 0-5 to grade, S to skip.

### Achievement System (`src/services/achievementService.ts`)

Defines a set of achievements unlocked by user actions (reading, annotating, quizzing, etc.). State persisted in localStorage. Toast notifications on unlock via `AchievementToast` component.

### LAN Sync

The Vite plugin provides REST endpoints that persist to `.insighthub-*.json` files:
- `/api/tags`, `/api/annotations`, `/api/quizzes`, `/api/quiz-history`
- `/api/read-meta`, `/api/read-history`
- `/api/ai/config` (editable AI settings)

All stores load from localStorage first, then merge from server on startup.

### CSS Theming

CSS custom properties defined in `src/styles/globals.css`. Light theme is default. Dark theme toggled via `data-theme="dark"` on `<html>`. Design uses blue-purple gradient primary, with green/orange/red/yellow/purple accents. Card radius 12px, shadow system with sm/md/lg levels.

CSS files:
- `globals.css` — CSS variables and resets
- `layout.css` — Layout and sidebar styles
- `components.css` — Reusable component styles (cards, dialogs, flashcards, etc.)
- `doc-reader.css` — Document reader and annotation styles
- `stats.css` — Statistics page styles
- `visualizations.css` — Chart and visualization styles
- `animations.css` — Keyframe animations

## Key Files

- `vite.config.ts` — Vite config with `@/` alias and `documentDiscovery` plugin
- `vite-plugins/documentDiscovery.ts` — Vite plugin for document discovery, API endpoints, AI proxy
- `src/utils/documentManifest.ts` — Dynamic document manifest (fetches from `/api/documents`)
- `src/utils/htmlParser.ts` — HTML → Document metadata extraction
- `src/utils/categoryMap.ts` — Category definitions and lookup functions
- `src/utils/xpath.ts` — Range ↔ XPath serialization for annotation positioning
- `src/utils/graphBuilder.ts` — Knowledge graph data builder
- `src/utils/pathBuilder.ts` — Learning path data builder
- `src/utils/personalMapBuilder.ts` — Personal knowledge map data builder
- `src/utils/reportAggregator.ts` — Stats/report data aggregation
- `src/utils/statsAggregator.ts` — Statistics chart data builders
- `src/services/aiService.ts` — AI API client (OpenAI-compatible, SSE streaming)
- `src/services/storageService.ts` — localStorage wrapper with `insighthub:` key prefix
- `src/services/spacedRepetition.ts` — SM-2 algorithm, card creation, HTML stripping
- `src/services/achievementService.ts` — Achievement definitions and unlock logic
- `src/scripts/copy-docs.ts` — Build-time script that copies document directories
