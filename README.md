# InsightHub

An intelligent knowledge management platform for browsing, annotating, and mastering HTML learning documents. Powered by local LLM integration for AI-generated quizzes, document chat, concept extraction, and study plans, with rich interactive visualizations and science-backed spaced repetition.

## Screenshots

<p align="center">
  <img src="docs/screenshots/01-home.png" alt="Home Dashboard" width="440"/>
  <img src="docs/screenshots/02-doc-reader.png" alt="Document Reader" width="440"/>
</p>
<p align="center">
  <em>Home Dashboard</em> — stats, recent reads, and category overview<br/>
  <em>Document Reader</em> — iframe embed with annotation highlights and AI panels
</p>

<p align="center">
  <img src="docs/screenshots/03-knowledge-graph.png" alt="Knowledge Graph" width="440"/>
  <img src="docs/screenshots/04-learning-path.png" alt="Learning Path" width="440"/>
</p>
<p align="center">
  <em>Knowledge Graph</em> — interactive D3-force document network<br/>
  <em>Learning Path</em> — knowledge tree with milestones and recommendations
</p>

<p align="center">
  <img src="docs/screenshots/05-stats.png" alt="Learning Analytics" width="440"/>
  <img src="docs/screenshots/06-hidden-docs.png" alt="Hidden Documents" width="440"/>
</p>
<p align="center">
  <em>Learning Analytics</em> — heatmap, radar, quiz dashboard, token usage<br/>
  <em>Hidden Documents</em> — manage hidden documents and categories
</p>

## Highlights

### AI-Powered Learning

InsightHub integrates with any OpenAI-compatible local LLM to bring intelligence directly into your reading workflow:

- **AI Quiz Generation** — Generate a complete quiz session on the fly. The LLM analyzes document content and produces 5 question types via SSE streaming: multiple-choice, true/false, short-answer, fill-in-the-blank, and code completion. Questions appear in real-time. Supports configurable difficulty and question count.

- **AI Document Chat** — Ask questions about the current document and get contextual answers. Supports multi-turn conversation with streaming responses.

- **AI Document Summarization** — Get a structured summary with one click. The AI extracts core takeaways, key concepts, and a content outline.

- **AI Evaluation** — Evaluate document accuracy, completeness, and depth with AI-generated assessments.

- **AI Inception (Progressive Summary)** — Multi-level progressive summarization that distills a document from full content to increasingly concise abstracts.

- **AI Concept Extraction** — Automatically extract key concepts from documents and generate spaced repetition flashcards.

- **AI Concept Challenges** — Devil's advocate style multi-round challenges that test your understanding of extracted concepts. 5 rounds per session with scoring and feedback.

- **AI Speech / Presentation Script** — Generate a presentation script from document content, ready for delivery.

- **AI Study Plan** — Paste a job description or learning goal, and the AI matches relevant documents from your library to create a personalized study plan.

- **AI Bubble** — Hover over any concept in the document reader to get an instant AI explanation popover.

- **Token Usage Tracking** — Monitor AI token consumption across all features with cost estimation for commercial LLMs (GPT-4o, Claude, DeepSeek).

- **Privacy-First** — All AI features run against a local model. No data leaves your machine. Works with llama.cpp, Ollama, vLLM, or any OpenAI-compatible server.

### Interactive Visualizations

InsightHub turns your learning data into actionable visual insights:

- **Knowledge Graph** — A force-directed network graph where documents, categories, and tags are nodes connected by relationships. Pan, zoom, and drag to explore. Built with D3-force simulation. Similarity edges computed via lazy TF-IDF cosine similarity.
- **Personal Knowledge Map** — A force-directed graph centered on "You", showing your personal knowledge landscape. Node size reflects engagement depth. Color-coded mastery levels from red (needs work) to cyan (mastered).
- **Knowledge Tree** — A collapsible tree view organizing content by Category → Document → Concept.
- **GitHub-Style Reading Heatmap** — Track daily reading activity over time.
- **Category Radar Chart** — A radar/spider chart showing reading distribution across categories.
- **Quiz Performance Dashboard** — Circular gauge for average score, difficulty distribution, and score trend line chart.
- **Reading Habits Analysis** — Hourly distribution, weekday patterns, and streak tracking.
- **Tag Cloud** — Dynamic word cloud where tag size reflects usage frequency.
- **Learning Path** — Timeline of learning milestones with recommended next steps.

### Spaced Repetition

Review AI-extracted concept cards with science-backed scheduling:

- Concept cards are **automatically generated** by AI when you extract concepts from documents.
- Reviews are scheduled using the **SM-2 algorithm** (SuperMemo 2), the same proven algorithm behind Anki.
- Intervals grow from 1 day → 6 days → 17 days → 49 days → ... based on your recall performance.
- 3D flip card animation with keyboard shortcuts (Space to flip, 0-5 to grade, S to skip).

### Rich Annotation System

- **Highlight** text in 6 colors (yellow, teal, orange, red, purple, blue) with persistent overlays that survive page reloads.
- **Comment** on any selection with threaded replies.
- **Click-to-view** — Click any highlighted passage to see its annotation in a popup.
- **Touch support** — Full annotation on iPad and other touch devices via `selectionchange` event with debounced selection detection.
- Annotations are serialized via XPath and restored with fuzzy text matching as fallback.
- All annotations are synced across LAN clients.

### Achievement System

44 achievements across 5 categories that unlock as you learn:

- **Reading** (11 milestones) — First Read → Million Words, including category completion and depth reading
- **Quiz** (10 milestones) — First Quiz → Question Crusher, tracking perfect scores and marathon sessions
- **Annotation** (9 milestones) — First Highlight → Conversation King, rewarding rich engagement
- **Streak & Explore** (9 milestones) — Three-Day Streak → Search Savant, with time-based bonuses (Night Owl, Early Bird)
- **Special** (8 milestones) — Speed Reader, AI Scholar, and other unique accomplishments

## Feature Overview

| Category | Features |
|----------|----------|
| **Document Management** | Category browsing, full-text search (FlexSearch), tag filtering, read-later list, document import (HTML), cross-document navigation, document/category hide & restore |
| **AI Integration** | Quiz generation (SSE streaming, 5 question types), document chat, summarization, evaluation, inception, concept challenges, speech/script, study plan, concept extraction, AI bubble, token usage tracking |
| **Annotations** | Multi-color highlights (6 colors), inline comments with replies, click-to-view popup, touch support, XPath persistence with fuzzy restore |
| **Spaced Repetition** | AI concept card extraction, SM-2 scheduling, 3D flip cards, keyboard shortcuts, progress tracking |
| **Visualizations** | Knowledge graph, personal map, knowledge tree, reading heatmap, category radar, quiz dashboard, reading habits, tag cloud, learning path, top engaged documents |
| **Gamification** | Achievement system with 44 unlockable milestones across 5 categories, toast notifications |
| **Data & Sync** | localStorage persistence, LAN sync via REST API, workspace isolation, full data backup/export/import (JSON) |
| **UI/UX** | Light/dark theme, responsive sidebar, keyboard shortcuts, iframe-based document reader, feature toggles, AI model profiles (multi-profile CRUD) |

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | React 19 + TypeScript | UI and type safety |
| Build | Vite 8 | Dev server and bundling with code splitting |
| State | Zustand 5 | Lightweight reactive state (7 stores) |
| Search | FlexSearch | Client-side full-text search |
| Charts | Recharts | Statistical charts (radar, heatmap, line, bar, area) |
| Graph | D3-force | Force-directed graph layouts |
| Icons | Lucide React | Consistent icon system |
| Styling | Pure CSS + Custom Properties | Theming without dependencies |
| Fonts | Inter Variable, JetBrains Mono | UI and code display fonts |
| AI | OpenAI-compatible SSE | Local LLM integration |

**Zero UI framework dependencies** — no Material UI, no Tailwind, no Bootstrap. Every component is hand-crafted with pure CSS for full control over the design system.

## Quick Start

### Prerequisites

- Node.js >= 18
- A local LLM server (optional, for AI features)

### Install & Run

```bash
cd insighthub
npm install
npm run dev
```

Open `http://localhost:5600`. Add your document workspaces from the Settings page or by editing `data/.insighthub-workspaces.json`.

> **Without a local LLM**, the app works fully — browsing, search, annotations, and all visualizations function normally. Only AI features (quiz, chat, concept extraction, etc.) require an LLM server.

### Production Build

```bash
npm run build    # Copies documents into public/docs/, type-checks, and bundles
npm run preview  # Serve the production build locally
```

## Project Structure

```
insighthub/
├── src/
│   ├── components/
│   │   ├── DocReader/           # 13 components for document reader
│   │   │   ├── AnnotationBar    #   Highlight/comment toolbar
│   │   │   ├── AnnotationPanel  #   Annotation list sidebar
│   │   │   ├── AnnotationPopup  #   Click-to-view annotation details
│   │   │   ├── CommentDialog    #   Comment editing dialog
│   │   │   ├── ChatPanel        #   AI multi-turn document chat
│   │   │   ├── SummaryPanel     #   AI document summarization
│   │   │   ├── EvaluationPanel  #   AI document evaluation
│   │   │   ├── InceptionPanel   #   AI progressive summarization
│   │   │   ├── ChallengePanel   #   AI concept challenges (5 rounds)
│   │   │   ├── SpeechPanel      #   AI presentation script
│   │   │   ├── SimilarDocsPanel #   Document similarity sidebar
│   │   │   ├── AIBubble         #   Hover concept explanation
│   │   │   └── WikiLinkRenderer #   Wiki-style bidirectional links
│   │   ├── Layout/              # App shell, sidebar, navbar
│   │   ├── visualization/       # 12 interactive visualization components
│   │   │   ├── KnowledgeGraph   #   Force-directed document/category/tag graph
│   │   │   ├── PersonalMap      #   Personal knowledge landscape graph
│   │   │   ├── KnowledgeTree    #   Collapsible category→doc→concept tree
│   │   │   ├── LearningPath     #   Timeline with milestone cards
│   │   │   ├── StudyPlanTree    #   AI-driven study plan tree
│   │   │   ├── CategoryRadar    #   Radar chart for category coverage
│   │   │   ├── ReadingHeatmap   #   GitHub-style daily activity heatmap
│   │   │   ├── QuizPerformance  #   Score gauge + trend + difficulty chart
│   │   │   ├── ReadingHabits    #   Hourly/weekday distribution + streaks
│   │   │   ├── TagCloud         #   Frequency-based word cloud
│   │   │   ├── TopEngagedDocuments # Ranked engagement list
│   │   │   └── ReportHero       #   Summary hero cards for stats page
│   │   ├── stats/               # Chart containers and stat components
│   │   ├── shared/              # Reusable UI (DocCard, DocGrid, FilterBar, etc.)
│   │   ├── Import/              # Document import dialog
│   │   └── search/              # Search dialog
│   ├── pages/
│   │   ├── HomePage.tsx              # Dashboard
│   │   ├── CategoryPage.tsx          # Category/workspace listing + doc grid
│   │   ├── DocReaderPage.tsx         # Document reader with all AI panels
│   │   ├── SearchPage.tsx            # Full-text search
│   │   ├── QuizPage.tsx              # AI quiz session
│   │   ├── StatsPage.tsx             # Learning analytics
│   │   ├── KnowledgeGraphPage.tsx    # Tabbed: graph / personal map / knowledge tree
│   │   ├── LearningPathPage.tsx      # Tabbed: tree / milestones / timeline / study plan
│   │   ├── SpacedRepetitionPage.tsx  # SM-2 concept card review
│   │   ├── NotesPage.tsx             # All notes/comments management
│   │   ├── TokenStatsPage.tsx        # AI token usage and cost estimation
│   │   ├── AchievementsPage.tsx      # Achievement gallery
│   │   ├── ReadLaterPage.tsx         # Read-later reading list
│   │   ├── HiddenDocsPage.tsx        # Hidden documents & categories management
│   │   └── SettingsPage.tsx          # Full settings (AI, quiz, features, workspaces, data)
│   ├── services/                # 12 service modules
│   │   ├── aiService.ts         # SSE streaming, quiz gen, summarization, grading
│   │   ├── readerAiService.ts   # Document chat, explain, translate, inception, speech
│   │   ├── conceptService.ts    # AI concept extraction
│   │   ├── challengeService.ts  # AI devil's advocate concept challenges
│   │   ├── studyPlanService.ts  # AI study plan generation
│   │   ├── tokenUsageService.ts # Token usage tracking
│   │   ├── similarityService.ts # Lazy TF-IDF document similarity
│   │   ├── quizService.ts       # Quiz generation and parsing
│   │   ├── searchService.ts     # FlexSearch index and query
│   │   ├── importService.ts     # Document import (HTML upload)
│   │   ├── storageService.ts    # localStorage wrapper
│   │   └── achievementService.ts # 44 achievement definitions
│   ├── stores/                  # 7 Zustand stores
│   ├── hooks/                   # 6 custom hooks
│   ├── utils/                   # XPath, graph builders, aggregators, exporters
│   └── styles/                  # 7 CSS files (globals, layout, components, etc.)
├── vite-plugins/                # Custom Vite plugin (document discovery + API proxy)
├── scripts/
│   └── copy-docs.ts             # Build-time document copy script
└── vite.config.ts
```

## Configuration

### AI Model

Configure from the Settings page — supports multiple AI model profiles with full CRUD, persisted to localStorage and synced to the server.

Compatible with any OpenAI-compatible server: llama.cpp, Ollama, vLLM, LM Studio, etc.

### Document Workspaces

Workspaces are configured in `data/.insighthub-workspaces.json` or added via the Settings page. Each workspace maps to a local document directory with its own ID prefix. Categories are discovered dynamically from the document folder structure.

```json
[
  {
    "id": "mydocs",
    "label": "MyDocuments",
    "icon": "BookOpen",
    "path": "../MyDocuments",
    "prefix": "my",
    "subtitle": "My Knowledge Base"
  }
]
```

Paths are relative to the `insighthub/` directory. Any number of workspaces can be added.

### Workspace Switching

Toggle between workspaces from the navbar. Each workspace independently filters documents, annotations, flashcards, tags, and sidebar navigation.

### Feature Toggles

Individual AI features can be enabled/disabled from Settings: Summary, Inception, Evaluation, Speech, Script, Quiz, Concept Extraction, Document Similarity. Disabling a feature only hides its button — existing data is preserved.

### Data Management

Settings includes full data backup and restore: export all data (localStorage + 8 server endpoints) as a single JSON file, and import to restore on any machine.

### Quiz Configuration

Configure difficulty (easy/medium/hard), question count, and enabled question types (multiple-choice, true/false, short-answer, fill-in-the-blank, code completion).

## Documentation

- [DESIGN.md](docs/DESIGN.md) — Technical design, architecture, data flow, algorithms
- [DEPLOY.md](docs/DEPLOY.md) — Build, deployment options (static, LAN, Docker), AI setup

## License

[MIT](LICENSE)
