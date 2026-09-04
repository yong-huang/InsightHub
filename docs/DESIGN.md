# InsightHub — Technical Design

> 交互式架构图（总体架构 / 启动流程 / AI 时序 / 数据持久化）见 [ARCHITECTURE.md](ARCHITECTURE.md)。本文件聚焦设计决策与关键算法。

## Overview

InsightHub is a client-side single-page application built with React 19 and TypeScript. It runs entirely in the browser with no backend server — data persistence uses localStorage with optional LAN sync via a Vite plugin that exposes REST endpoints writing to JSON files.

## Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────┐
│                   Pages (Routes)                 │
│  Home, DocReader, Quiz, Notes, Stats, SR, etc.  │
├─────────────────────────────────────────────────┤
│              Zustand Stores (State)              │
│  document · annotation · quiz · tag · concept   │
│  card · search · preference                     │
├─────────────────────────────────────────────────┤
│                   Services                       │
│  AI (SSE) · Quiz · Search · Storage · Token     │
├─────────────────────────────────────────────────┤
│               Custom Vite Plugin                 │
│  Document Discovery · API Proxy · LAN Sync       │
├─────────────────────────────────────────────────┤
│           Document Source (HTML files)            │
│  Configured via .insighthub-workspaces.json      │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **No backend** — All state lives in Zustand stores, persisted to localStorage. The Vite dev plugin provides lightweight file-based LAN sync; in production, a static file server suffices.

2. **Document-as-iframe** — Documents are rendered inside an iframe to isolate styles. Annotations are overlaid using XPath-based range serialization.

3. **Vite plugin for document discovery** — Instead of a build-time index, a custom Vite plugin scans source directories at dev time, providing `/api/documents` (manifest) and `/dev-docs/` (file serving). This avoids rebuilding when documents change.

4. **Workspace isolation** — The app supports multiple user-defined workspaces configured in `data/.insighthub-workspaces.json`. Each workspace filters all data (documents, annotations, flashcards, tags) by document source.

## Data Flow

### Startup Sequence

```
App mounts
  → useInitializeApp()
    → documentStore.initializeDocuments()
      → fetch /api/documents (enriched manifest, 1s cache)
      → build Document Map directly from manifest (no content fetches)
      → merge /api/read-meta + /api/read-history (fetched in parallel)
      → UI becomes interactive
      → Phase 2 (background): indexAllDocs() builds FlexSearch index
        in batches of 50, freeing contentText afterwards
    → in parallel: tagStore.loadTags() · searchStore.loadHistory()
      · quizStore.loadHistory() · quizStore.loadSavedQuizzes()
      · preferenceStore.loadQuizSettingsFromServer()
      · annotationStore.loadAnnotations()   → localStorage first, merge server
      · conceptCardStore.loadCards()        → localStorage first + migration
    → storageService.syncFromServer()
      → preferenceStore.loadWorkspacesFromServer()
    → registerDynamicCategories() + extendCategoryMap()
```

### Annotation Lifecycle

```
User selects text in iframe
  → useAnnotationIframe captures Selection → Range
  → trimRangeEdges() removes trailing whitespace
  → rangeToXPath() serializes to XPath + offsets
  → Stored in annotationStore → localStorage + /api/annotations

On page load (restore):
  → xpathToRange() resolves XPath to DOM Range
  → On failure: findTextRangeFuzzy() searches by text content
  → applyMarkToRange() wraps Range in <mark> elements
```

### Spaced Repetition Flow

```
Concept cards are AI-extracted from documents (conceptService)
  → conceptCardStore tracks extraction status/errors per document
  → Cards sync to localStorage + /api/concept-cards
  → Deleting an annotation marks its sourced cards as sourceDeleted

Review session (/spaced-repetition):
  → getDueCards() returns cards where nextReview ≤ now
  → User flips card, grades 0-5
  → reviewCard() → sm2Review() updates interval/repetition/efactor
  → Persisted to localStorage, synced to server
```

### AI Quiz Flow

```
User clicks "Generate Quiz" on DocReaderPage
  → quizStore.startGeneration(docId)
  → quizService calls aiService.generateQuizQuestions() → /api/ai/chat/completions (SSE proxy)
  → Local LLM streams quiz questions
  → Parsed and stored in quizStore
  → User takes quiz, grades stored in localStorage + /api/quiz-history
```

## State Management

All state is managed by Zustand stores. Each store follows this pattern:

```typescript
const useStore = create<StoreState>((set, get) => ({
  // State
  data: [],

  // Load from localStorage
  load: () => {
    const data = storageService.getXxx()
    set({ data })
    // Optional: merge from server
    fetch('/api/xxx').then(...)
  },

  // Mutations: update state + persist
  add: (item) => {
    const updated = [...get().data, item]
    storageService.setXxx(updated)
    set({ data: updated })
  },
}))
```

### Store Responsibilities

| Store | Key State | Persistence |
|-------|-----------|-------------|
| documentStore | `Map<string, Document>` | localStorage + read-meta server |
| annotationStore | `Annotation[]` | localStorage + `/api/annotations` |
| quizStore | `savedQuizzes`, `quizHistory` | localStorage + `/api/quizzes` |
| conceptCardStore | `ConceptCard[]` (SM-2 scheduled) | localStorage + `/api/concept-cards` |
| tagStore | `Tag[]` | localStorage + `/api/tags` |
| searchStore | query, results | localStorage (history) |
| preferenceStore | theme, workspace, sidebar | localStorage |

## Key Algorithms

### SM-2 Spaced Repetition

Standard SuperMemo 2 algorithm for flashcard scheduling:

```
grade: 0=forgot, 1=hard, 2=difficult, 3=hesitant, 4=easy, 5=perfect

if grade < 3:
    repetition = 0, interval = 1          // reset
elif repetition == 0:
    interval = 1, repetition = 1
elif repetition == 1:
    interval = 6, repetition = 2
else:
    interval = round(interval × efactor), repetition++

efactor = max(1.3, efactor + 0.1 - (5 - grade) × (0.08 + (5 - grade) × 0.02))
```

### XPath-based Annotation Serialization

Text selections are serialized as:
- `startContainer` / `endContainer`: CSS selector path to the text node's parent element
- `startOffset` / `endOffset`: character offset within the text node

On restore, the XPath is resolved to locate the original DOM node. If the document has changed, a fuzzy text search fallback matches by content similarity.

### FlexSearch Full-Text Search

Search maintains two FlexSearch Document indexes over `title` and `content`:

- **forward index** (prefix recall) — "22" also recalls "220", "2210", …
- **strict index** (exact tokens) — "22" matches only the full token "22"

Both share an `Encoder({ dedupe: false })`: the default encoder collapses consecutive duplicate characters, which mangles numbers ("22" → "2") and makes "#22" indistinguishable from "#220" at the token level.

`parseSearchQuery` peels filters (`#tag`, `@workspace`, `category:`) from the raw query. `search()` then collects candidates in descending score tiers — exact title (100) → numeric-prefix title (90, digits only) → exact content (80) → numeric-prefix content (72) → forward title (50) → forward content (30) — dedupes by document (best tier wins), sorts by tier score, and slices to `limit`. A large candidate pool (150/tier) prevents prefix matches from crowding exact matches out of the cut. The index is rebuilt on each app load.

## CSS Architecture

- **globals.css** — CSS custom properties (colors, spacing, shadows, typography), resets
- **layout.css** — Page shell, sidebar, navbar
- **components.css** — Shared components (cards, dialogs, buttons, flashcards, achievements)
- **doc-reader.css** — Iframe overlay, annotation marks, panels
- **stats.css** — Statistics page grid and chart containers
- **visualizations.css** — D3/Recharts canvas styles, SVG node/edge styling
- **animations.css** — Keyframe animations (fade, slide, flip)

Theming uses `[data-theme="dark"]` on `<html>` to override CSS custom properties.

## Component Patterns

### Page Components

Each route maps to a single page component in `src/pages/`. Pages use Zustand stores directly (no prop drilling or context providers beyond React Router).

### DocReader Architecture

The document reader embeds HTML content in an iframe. A custom hook (`useAnnotationIframe`) bridges the main window and iframe DOM:

- **Selection detection**: `mouseup` event in iframe → `contentWindow.getSelection()`
- **Annotation overlay**: `applyMarkToRange()` wraps text in `<mark>` elements with `data-annotation-id`
- **Click interaction**: Click on `<mark>` elements opens `AnnotationPopup` positioned relative to the iframe

### Visualization Components

Graph visualizations (knowledge graph, learning path, personal map) use D3-force for layout and SVG for rendering. Data is built by utility functions in `src/utils/` (`graphBuilder.ts`, `pathBuilder.ts`, `personalMapBuilder.ts`).

The **Knowledge Tree** is a recursive collapsible tree component showing Category → Document → Concept hierarchy. It uses pure React with CSS (no D3). Categories expand by default; documents show read status (green checkmark) and link to the doc reader; concepts show definitions on hover.

Chart visualizations (stats, heatmap, radar) use Recharts with data aggregated by `reportAggregator.ts` and `statsAggregator.ts`.
