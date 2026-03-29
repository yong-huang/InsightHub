# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

InsightHub is a React-based web application for browsing, searching, and quizzing against 91 HTML learning documents from MindInsight and TechInsight directories.

## Architecture

- **Framework**: Vite + React 18 + TypeScript (path alias `@/` → `src/`)
- **State**: Zustand stores (preference, document, tag, search, quiz)
- **Search**: FlexSearch with CJK support
- **AI Quiz**: Connects to local Qwen3.5-27B-4bit at `http://127.0.0.1:7001/v1`

## Key Directories

- `insighthub/src/pages/` — Route pages (Home, Category, DocReader, Search, Quiz)
- `insighthub/src/components/` — Layout, shared components, search dialog
- `insighthub/src/stores/` — Zustand state management
- `insighthub/src/services/` — AI service, quiz service, search service, storage service
- `insighthub/src/utils/` — Document manifest (91 entries), HTML parser, category map
- `insighthub/src/styles/` — CSS (globals, layout, components, animations)

## Running

```bash
cd insighthub
npm run dev     # Start dev server (access MindInsight/TechInsight via @fs)
npm run build   # Production build (copies docs to public/docs/)
```

## Document Sources

- MindInsight: `../MindInsight/` (academic, film-analysis, literature, philosophy)
- TechInsight: `../TechInsight/` (ai-frameworks, algorithms, cloud, dell, infrastructure, programming)
- Excludes: `backups/`, `template/`, `index.html`
