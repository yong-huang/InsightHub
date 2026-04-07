# InsightHub

A client-side React SPA for browsing, searching, annotating, and quizzing against HTML learning documents. Features spaced repetition flashcards, knowledge graph visualization, and AI-powered quiz generation.

## Features

- **Document Browsing** — Browse HTML documents from two knowledge bases: MindInsight (humanities) and TechInsight (technology), organized by categories.
- **Full-Text Search** — Instant search across all documents powered by FlexSearch.
- **Annotations** — Highlight text and add comments. Annotations persist via XPath serialization and restore across sessions.
- **AI Quizzes** — Generate multiple-choice and true/false quizzes from documents using a local LLM (OpenAI-compatible API). Streaming generation with real-time feedback.
- **Spaced Repetition** — Annotations are automatically converted into flashcards. Review sessions use the SM-2 algorithm to schedule reviews based on the forgetting curve.
- **Knowledge Graph** — Interactive graph visualization showing relationships between documents, categories, and tags.
- **Learning Analytics** — Reading heatmap, category radar, quiz performance charts, reading habits analysis.
- **Achievements** — Gamified learning with unlockable achievements for reading, annotating, and quizzing.
- **LAN Sync** — Share annotations, tags, and quiz data across clients on the same network via REST endpoints.
- **Dark Theme** — Light/dark mode with CSS custom properties.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| State | Zustand 5 |
| Search | FlexSearch |
| Charts | Recharts + D3-force |
| Icons | Lucide React |
| Styling | Pure CSS with custom properties |
| AI | OpenAI-compatible API (local LLM) |

## Quick Start

### Prerequisites

- Node.js >= 18
- A local LLM server running an OpenAI-compatible API (e.g., [llama.cpp](https://github.com/ggerganov/llama.cpp), [Ollama](https://ollama.ai))

### Install & Run

```bash
cd insighthub
npm install
npm run dev
```

The dev server starts at `http://localhost:3060` by default. Document source directories must exist at the paths configured in `vite.config.ts`.

### Production Build

```bash
npm run build
npm run preview
```

The `prebuild` script copies document HTML files into `public/docs/` so the production build is self-contained.

## Project Structure

```
insighthub/
├── public/                  # Static assets (favicon, built manifest)
├── scripts/                 # Build scripts (copy-docs.ts)
├── src/
│   ├── components/
│   │   ├── DocReader/       # Annotation bar, panel, popup, comment dialog
│   │   ├── Import/          # Document import dialog
│   │   ├── Layout/          # Layout shell, navbar, sidebar
│   │   ├── search/          # Global search dialog
│   │   ├── shared/          # Reusable components (DocCard, FilterBar, etc.)
│   │   ├── stats/           # Statistics chart components
│   │   └── visualization/   # Knowledge graph, learning path, personal map
│   ├── hooks/               # Custom hooks (annotations, keyboard, theme)
│   ├── pages/               # Route pages (one file per route)
│   ├── services/            # Business logic (AI, quiz, search, storage, etc.)
│   ├── stores/              # Zustand state stores
│   ├── styles/              # CSS files (globals, layout, components, etc.)
│   ├── types/               # TypeScript type definitions
│   └── utils/               # Utilities (XPath, HTML parser, graph builder, etc.)
├── vite-plugins/            # Custom Vite plugins (document discovery, API proxy)
├── vite.config.ts
└── tsconfig.json
```

## Configuration

### AI Model

Configure the local LLM endpoint in the Settings page (`/settings`) or via the API proxy endpoint. Default: `http://127.0.0.1:7001/v1` with model `Qwen/Qwen3.5-27B-4bit`.

### Document Sources

Document directories are configured in `vite.config.ts`:

```typescript
documentDiscovery({
  mindInsightDir: '/path/to/MindInsight',
  techInsightDir: '/path/to/TechInsight',
  aiApiUrl: 'http://127.0.0.1:7001/v1',
  aiModel: 'Qwen/Qwen3.5-27B-4bit',
})
```

### Workspace

The app supports two workspaces (MindInsight / TechInsight) switchable from the navbar. Each workspace filters documents, annotations, flashcards, and sidebar navigation by source.

## Documentation

- [DESIGN.md](docs/DESIGN.md) — Technical design and architecture
- [DEPLOY.md](docs/DEPLOY.md) — Deployment guide
- [CLAUDE.md](CLAUDE.md) — AI assistant context (development guidelines)

## License

Private project.
