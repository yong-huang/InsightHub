# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InsightHub is a client-side React SPA for browsing, searching, and quizzing against HTML learning documents. It connects to a local OpenAI-compatible LLM (default: Qwen3.5-27B-4bit) for AI-generated quizzes, document chat, concept extraction, and study plans. Features include text annotations (highlights and comments), spaced repetition flashcards, knowledge graph, whiteboard, code editor, shadow typing, achievements, token usage tracking, and LAN sync across clients.

## Commands

```bash
cd insighthub
npm run dev       # Start Vite dev server on port 5600 (serves docs via documentDiscovery plugin at /dev-docs/)
npm run build     # Runs prebuild (copy-docs.ts) → tsc -b → vite build
npm run lint      # ESLint (flat config, no --fix flag available)
npm run test      # Vitest (unit tests in __tests__ directories)
npm run preview   # Preview production build
```

## Architecture

**Stack**: Vite 8 + React 19 + TypeScript, Zustand 5 for state, FlexSearch for full-text search, Recharts for charts, D3-force for graph layouts, CodeMirror 6 for code editing, Lucide React for icons. Pure CSS with custom properties for theming (light/dark). No UI component library.

**Path alias**: `@/` maps to `src/` (configured in both `tsconfig.app.json` and `vite.config.ts`).

**TypeScript**: Split tsconfig — `tsconfig.app.json` (src/, `noUnusedLocals/Params: false`, strict) and `tsconfig.node.json` (vite-plugins, scripts, `noUnusedLocals/Params: true`, strict). Both use `verbatimModuleSyntax` and `erasableSyntaxOnly`, target ES2023.

**Default theme**: Dark theme (`data-theme="dark"` set in `index.html`). Toggle at runtime via `preferenceStore`.

**Workspace paths**: Workspace directories are configured in `data/.insighthub-workspaces.json`. Paths are stored as relative (from `insighthub/` root); the server normalizes absolute paths to relative on save. `vite.config.ts` reads this at build time via `loadWorkspacePaths()` and whitelists them in `server.fs.allow`. The Vite plugin's `documentDiscovery` function reads the same file at runtime. New installations start with no workspaces — users add them via Settings.

### Document Loading Pipeline

Documents are discovered dynamically via a Vite plugin (`vite-plugins/documentDiscovery.ts`) that scans workspace source directories:

1. **Dev mode**: Plugin scans workspace directories, provides `/api/documents` (manifest, 1s cache) and `/dev-docs/` (serves files from source). `useInitializeApp` fetches manifest, parses each HTML via DOMParser (`src/utils/htmlParser.ts`), stores in `documentStore`, builds FlexSearch index. Batch loading (50 docs/batch) with progress tracking.
2. **Production**: `npm run prebuild` runs `scripts/copy-docs.ts` to copy all docs into `public/docs/`. `useDocumentUrl` hook switches between `/dev-docs/` (dev) and `/docs/` (prod) via `import.meta.env.DEV`. Imported docs (prefixed `imported-`) use `/api/imported-doc/` endpoint.

### Data Flow

```
useInitializeApp (hook)
  → preferenceStore.setTheme (apply theme to <html>)
  → documentStore.initializeDocuments (fetch /api/documents → parse HTMLs → build FlexSearch index)
  → tagStore.loadTags / searchStore.loadHistory / quizStore.loadHistory
  → annotationStore.loadAnnotations (restore from localStorage + merge from server)
  → conceptCardStore.loadCards (restore from localStorage, migrate if needed)
  → Server sync: tags, annotations, concept cards, read-meta
```

### Routing (React Router v7, `App.tsx`)

All routes use `React.lazy()` for code splitting, wrapped in `<Layout />`, `<Suspense>`, and `<ErrorBoundary>`. Static routes are defined before dynamic catch-all routes.

**Static routes:**
- `/` — Home dashboard with stats and category overview
- `/search` — Full-text search results
- `/settings` — AI model profiles (CRUD), quiz preferences, feature toggles, workspace management, data backup/restore
- `/notes` — Notes management (all comments across documents, grouped by doc)
- `/stats` — Learning analytics with charts (heatmap, radar, quiz performance, token usage)
- `/read-later` — Read-later reading list
- `/achievements` — Achievement gallery with 44 unlockable milestones
- `/knowledge-graph` — Tabbed: D3-force knowledge graph / personal map / collapsible knowledge tree
- `/learning-path` — Tabbed: knowledge tree / milestones / activity timeline / AI study plan
- `/spaced-repetition` — SM-2 concept card review with 3D flip animation
- `/token-stats` — AI token usage statistics with cost estimation
- `/hidden-docs` — Hidden documents & categories management
- `/trash` — Trash/recycle bin for deleted documents and categories

**Dynamic routes:**
- `/doc/:docId` — Document reader (iframe embed) with annotation, AI chat, summary, evaluation, inception, challenge, whiteboard, code editor, shadow typing panels
- `/quiz/:quizId` — AI quiz session (quizId = docId + timestamp)
- `/tag/:tagId` — Documents filtered by tag
- `/:workspace` — Workspace root (category listing)
- `/:workspace/:category` — Workspace category (filtered document listing)

Global components (outside Routes): `<SearchDialog />`, `<AchievementToast />`

### Zustand Stores (`src/stores/`)

All stores persist to localStorage via `storageService` (key prefix `insighthub:`). On startup, load from localStorage first, then merge from server endpoints.

- **documentStore** — Document Map, loading state, filters, read tracking, ratings. Fetches/parses docs, builds FlexSearch index.
- **searchStore** — Query state, results, search history. Delegates to FlexSearch via `searchService`. Results are in-memory only.
- **quizStore** — Quiz sessions, attempts, AI grading results. Persists current session to localStorage, syncs history to server.
- **tagStore** — Tag CRUD and document-tag associations. Merged by name between local and server.
- **annotationStore** — Annotations (highlights, comments), persisted to localStorage + server. Merged by ID. Marks related flashcards as `sourceDeleted` on removal.
- **preferenceStore** — Theme, AI settings, sidebar state, active workspace, quiz settings, feature toggles.
- **conceptCardStore** — Concept cards with SM-2 scheduling, auto-extracted from documents via AI. Tracks extraction status/errors per document. Syncs to server.

### AI System

Multiple service files, all calling local OpenAI-compatible API through Vite plugin proxy (`/api/ai/chat/completions`):

- **aiService.ts** — Core client: `callAI()` (non-streaming), `callAIStream()` (SSE). 120s timeout, 180s idle timeout. Token usage captured for both paths.
- **readerAiService.ts** — Document chat, explain selection, translate, inception (progressive summarization), presentation script generation.
- **conceptService.ts** — Concept card extraction from documents (definitions, examples, related concepts).
- **challengeService.ts** — Devil's advocate concept challenges (5-round sessions with scoring).
- **studyPlanService.ts** — AI-driven study plan matching documents to JD/goal text.
- **whiteboardService.ts** — AI vision analysis for canvas content (detects drawings, diagrams, text in whiteboard).

Default config: `http://127.0.0.1:7001/v1`, model `Qwen/Qwen3.5-27B-4bit`. Configurable from Settings (multi-profile CRUD, persisted to server). Works with any OpenAI-compatible server (llama.cpp, Ollama, vLLM, LM Studio).

### Annotation System (`src/hooks/useAnnotationIframe.ts`, `src/utils/xpath.ts`)

Text selection in iframe is detected via `contentWindow.getSelection()`. Ranges are serialized to XPath + offsets for persistence. On restore: exact XPath resolution → whitespace-normalized matching → fuzzy sliding-window match (character similarity >= 70%). Cross-element ranges use `splitText` + wrap to avoid DOM corruption. `trimRangeEdges` removes trailing whitespace before serialization. 6 highlight colors, threaded comments with replies. Touch support via `selectionchange` event with debounced detection.

### Spaced Repetition System (`src/services/spacedRepetition.ts`, `src/stores/conceptCardStore.ts`)

Concept cards (AI-extracted from documents) reviewed with SM-2 algorithm:
- **SM-2 scheduling**: grade 0-5, intervals: 1→6→N×efactor days. Failed (grade<3) reset to interval=1. Interval >= 21 days = "mastered".
- **Workspace isolation**: Cards filtered by active workspace via document source.
- **Keyboard shortcuts**: Space/Enter to flip, 0-5 to grade, S to skip.

### LAN Sync

The Vite plugin (`vite-plugins/documentDiscovery.ts`) provides REST endpoints that persist to `.insighthub-*.json` files in the workspace `data/` directory:

**Document & workspace:**
- `/api/documents` — Document manifest (1s cache)
- `/api/workspaces` — Workspace config (GET/POST)
- `/api/browse-directories` — Directory browser for workspace path selection
- `/api/workspace-document` — Get document metadata by ID / Delete workspace document (GET/POST)
- `/api/workspace-category` — List documents in category / Delete workspace category (GET/POST)

**AI & code execution:**
- `/api/ai/config` — AI settings (GET/POST, supports profile CRUD)
- `/api/ai/models` — List available AI models from configured endpoint
- `/api/ai/chat/completions` — Proxy to local LLM (SSE streaming, caches per URL/model)
- `/api/ai/tts` — Text-to-speech proxy (returns audio/mpeg)
- `/api/code-runtimes` — List available code execution runtimes
- `/api/code-run` — Execute code in specified language (streaming output via SSE)

**Data sync:**
- `/api/tags` — Tag CRUD (GET/POST)
- `/api/annotations` — Annotation CRUD (GET/POST)
- `/api/quizzes` — Quiz CRUD (GET/POST)
- `/api/quiz-history` — Quiz attempt history (GET/POST, 100-entry limit)
- `/api/read-meta` — Document reading metadata (GET/POST)
- `/api/read-history` — Reading history (GET/POST, 365-day limit)
- `/api/concept-cards` — Concept cards with SM-2 scheduling (GET/POST)
- `/api/client-storage` — Client-side storage sync (GET/POST, with legacy format migration)

**Document import:**
- `/api/imported-documents` — Import document management (GET/POST)
- `/api/imported-doc/:id` — Serve imported document content
- `/api/fetch-url` — Import documents from web URLs (fetches, sanitizes, saves)
- `/api/move-workspace-document` — Move single document between workspaces/categories
- `/api/move-workspace-category` — Move entire category between workspaces

**Development:**
- `/dev-docs/:path*` — Serve documents from source directories (dev mode only)

### Design System

Most pages use the `cs-*` design system (`cs-settings` container at 900px centered). Exceptions: DocReaderPage (full-screen iframe layout), StatsPage (wider layout for charts), visualization pages (fullscreen mode).

Key patterns:
- Container: `cs-settings` (max-width 900px, centered)
- Header: `cs-settings-header` + `cs-section-label` + h1 + `cs-settings-subtitle`
- Cards: `cs-card` + `cs-card-header` + `cs-card-body`
- Buttons: `cs-btn cs-btn-primary/secondary` in `cs-btn-group`
- Empty states: `cs-empty-hint`
- Navbar: `navbar-icon-btn` (icon-only with tooltip)
- DocReader toolbar: `dr-action-btn` (icon-only with tooltip)

### CSS Theming

CSS custom properties defined in `src/styles/globals.css`. Dark theme is default (set in `index.html`). Blue-purple gradient primary, with green/orange/red/yellow/purple accents. Card radius 12px, shadow system with sm/md/lg levels.

CSS files: `globals.css` (variables + resets), `layout.css` (app shell + sidebar), `components.css` (reusable components + cs-* design system), `doc-reader.css` (reader + annotations + code editor), `stats.css` (statistics page), `visualizations.css` (charts + graphs + fullscreen mode), `animations.css` (keyframes + reveal animations).

## Documentation

- `README.md` — Project overview, features, screenshots, quick start

## Key Source Files

- `vite.config.ts` — Vite config with `@/` alias, `documentDiscovery` plugin, build chunk splitting (vendor-react, vendor-recharts, vendor-d3, vendor-codemirror)
- `vite-plugins/documentDiscovery.ts` — Custom Vite plugin: document discovery, all `/api/*` endpoints, AI proxy, workspace config
- `scripts/copy-docs.ts` — Build-time script that copies document directories to `public/docs/`
- `data/.insighthub-workspaces.json` — Workspace configuration (sources, prefixes, UI fields)

### Hooks (`src/hooks/`)
`useInitializeApp` (bootstrap), `useAnnotationIframe` (iframe annotation detection), `useDocumentUrl` (dev/prod URL switching), `useDynamicCategories` (runtime category registration with doc counts and read stats), `useThemeColors` (read CSS variable values), `useKeyboard` (global keyboard shortcuts: Cmd/Ctrl+K for search, Escape to close)

### Services (`src/services/`)
`aiService` (core AI client + token tracking), `readerAiService` (doc-level AI: chat, explain, translate, inception, speech script), `conceptService` (concept card extraction), `challengeService` (concept challenges), `studyPlanService` (study plan), `whiteboardService` (whiteboard AI vision), `quizService` (quiz gen/parse), `tokenUsageService` (token persistence), `searchService` (FlexSearch), `similarityService` (lazy TF-IDF), `importService` (doc import), `storageService` (localStorage wrapper), `achievementService` (44 achievements), `spacedRepetition` (SM-2 algorithm)

### Components (`src/components/`)

**Layout/** — `Layout`, `Sidebar` (with workspace switcher), `Navbar` (with search), `FileTree` (workspace document browser)

**DocReader/** — `AnnotationPanel`, `AnnotationPopup`, `AnnotationBar`, `CommentDialog`, `AIBubble`, `ChatPanel`, `EvaluationPanel`, `InceptionPanel`, `SummaryPanel`, `ChallengePanel`, `ConceptCardsPanel`, `QuizPanel`, `ScriptPanel`, `ShadowTypingPanel`, `SimilarDocsPanel`, `WhiteboardPanel`, `WikiLinkRenderer`, `RatingDialog`, `CodeEditorPanel`

**visualization/** — `KnowledgeGraph`, `KnowledgeTree`, `StudyPlanTree`, `PersonalMap`, `CategoryRadar`, `LearningPath`, `QuizPerformancePanel`, `ReadingHabits`, `TagCloud`, `TopEngagedDocuments`, `TreeNode`, `ReportHero`

**stats/** — `AnnotationStats`, `CategoryCompletion`, `ChartCard`, `QuizScoreTrend`, `ReadingHeatmap`, `ReadingTrend`, `WordCountDist`

**shared/** — `StatCard`, `DocCard`, `DocGrid`, `FilterBar`, `LoadingScreen`, `ErrorBoundary`

**Import/** — `ImportDialog`, `MoveCategoryDialog`, `MoveDocumentDialog`, `UrlImportDialog`

**Other** — `AchievementToast`, `search/SearchDialog`

### Pages (`src/pages/`)
`HomePage`, `CategoryPage`, `DocReaderPage`, `SearchPage`, `QuizPage`, `StatsPage`, `AchievementsPage`, `LearningPathPage`, `KnowledgeGraphPage`, `NotesPage`, `ReadLaterPage`, `SpacedRepetitionPage`, `TokenStatsPage`, `SettingsPage`, `HiddenDocsPage`, `TrashPage`

### Utils (`src/utils/`)
`htmlParser` (DOMParser document processing), `xpath` (annotation positioning), `documentManifest` (manifest generation), `categoryMap` (category mapping), `workspaceUtils` (workspace config), `workspaceIcons` (icon management), `pathBuilder` (file path construction), `statsAggregator` (statistics aggregation), `reportAggregator` (report generation), `dataExporter` (data export), `notesExporter` (notes export), `timelineBuilder` (timeline data), `personalMapBuilder` (knowledge map), `prefetchRoute` (route preloading), `bidirectionalLinks` (wiki link resolution), `graphBuilder` (graph data construction), `markdownRenderer` (markdown rendering)

### Types (`src/types/`)
All types defined in `index.ts` — Document, Workspace, Annotation, Quiz, Tag, Search, ConceptCard, Preferences, Challenge interfaces.

### Document Source Prefixes

Each workspace defines a custom prefix for document IDs (e.g. `mi-`, `ti-`, `li-`). Prefixes and categories are configured per-workspace in `data/.insighthub-workspaces.json`.
