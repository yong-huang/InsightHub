# InsightHub 架构文档

本文档描述 InsightHub 的整体架构、关键机制与数据流，并附四张可交互的架构图。图由 [Archify](https://github.com/tt-a1i/archify) 从本仓库代码事实生成，规格 JSON 与 HTML 一同保存在 `docs/diagrams/`，可随时重新生成。

> **交互图使用说明**：每张图是单文件 HTML，双击即可在浏览器打开，无需服务器。内置明暗主题切换、缩放/平移、节点搜索、关系追踪动画、聚焦视图（右上角 Views），以及 PNG / SVG / WebM 导出。

## 交互式架构图

| 图 | 类型 | 文件 | 内容 |
|---|---|---|---|
| 系统总体架构 | architecture | [insighthub-architecture.html](diagrams/insighthub-architecture.html) · [规格](diagrams/insighthub-architecture.json) | 浏览器 SPA、Vite 插件服务层与本机资源（文档源 / JSON 文件 / 本地 LLM）的边界与连接 |
| 启动与文档加载流程 | workflow | [startup-workflow.html](diagrams/startup-workflow.html) · [规格](diagrams/startup-workflow.json) | 应用挂载到富化清单加载、UI 可交互、后台建索引的两阶段主路径 |
| AI 请求时序 | sequence | [ai-request-sequence.html](diagrams/ai-request-sequence.html) · [规格](diagrams/ai-request-sequence.json) | 读者 → aiService → 插件 AI 代理 → 本地 LLM 的 SSE 流式往返与 token 计量 |
| 数据持久化与 LAN 同步 | dataflow | [persistence-dataflow.html](diagrams/persistence-dataflow.html) · [规格](diagrams/persistence-dataflow.json) | Zustand Stores → localStorage → REST 同步 → JSON 落盘 → 多端合并的数据管线 |

## 总体架构

InsightHub 是无后端服务器的客户端单页应用。所谓"服务端"是 Vite 开发服务器上的自定义插件 `documentDiscovery`：它承担文档发现、REST 数据同步与 AI 代理三种职责，把状态落盘为本机 JSON 文件。生产构建后应用退化为纯静态站点（`prebuild` 把文档复制到 `public/docs/`），局域网同步等文件能力仅在 dev/本地预览模式下可用。

三个物理边界：

1. **浏览器（React 19 SPA）** —— 页面层、Zustand 状态层、服务层；FlexSearch 全文索引在浏览器内构建；localStorage 是首选持久化。
2. **Node 进程（Vite 8）** —— `documentDiscovery` 插件，约 25 个 `/api` 端点，读写 `data/.insighthub-*.json`，代理本地 LLM。
3. **本机资源** —— 工作区文档目录（HTML/图片）、JSON 数据文件、OpenAI 兼容本地 LLM（默认 `http://127.0.0.1:7001/v1`，模型 `Qwen/Qwen3.5-27B-4bit`）。

工作区目录在 `data/.insighthub-workspaces.json` 中配置；`vite.config.ts` 在启动时读取它并加入 `server.fs.allow` 白名单，插件在运行时读取同一文件扫描文档。

## 技术栈

Vite 8 · React 19 · TypeScript（严格模式，ES2023）· Zustand 5 · React Router v7 · FlexSearch · Recharts · D3-force · CodeMirror 6 · 纯 CSS 自定义属性主题（无 UI 组件库）。路径别名 `@/` → `src/`。

## 分层职责

| 层 | 位置 | 职责 |
|---|---|---|
| 页面层 | `src/pages/`（16 个路由）+ `src/components/` | 路由视图；DocReader 含 19 个面板组件（标注、AI 聊天、白板、代码编辑器等） |
| 状态层 | `src/stores/`（7 个 store） | document / annotation / quiz / tag / search / preference / conceptCard，全部 localStorage 优先 + 服务端合并 |
| 服务层 | `src/services/` | aiService（SSE 客户端）、readerAi / concept / challenge / studyPlan / whiteboard 等领域服务、storageService（同步）、searchService（FlexSearch） |
| 本地服务层 | `vite-plugins/documentDiscovery.ts` | 文档扫描与清单、静态文档服务（`/dev-docs/`）、全部 `/api` 端点、AI 代理 |
| 构建脚本 | `insighthub/scripts/` | `copy-docs.ts`（prebuild 复制文档）、`lib/scanDocuments.ts`（服务端富化扫描） |

## 关键机制

### 文档加载（两阶段，清单直读）

服务端 `scanWorkspaces` 扫描工作区时预先提取标题、字数、章节与内容摘要，`/api/documents` 返回富化清单（1s 缓存）。客户端因此**零内容抓取**：

1. **Phase 1**：`documentStore.initializeDocuments()` 拉取清单 → 直接构建 `Document Map` → 并行请求 `/api/read-meta` 与 `/api/read-history` 合并阅读状态 → UI 可交互。
2. **Phase 2**：`indexAllDocs()` 后台每 50 篇一批构建 FlexSearch 索引，完成后释放 `contentText` 节省内存。

文档正文由 DocReader 通过 iframe 加载：开发模式 `/dev-docs/`，生产模式 `/docs/`（`useDocumentUrl` 按 `import.meta.env.DEV` 切换）。

### AI 调用链路

浏览器只访问 `/api/ai/chat/completions`，由插件转发到 AI Profile 配置的 OpenAI 兼容地址（规避 CORS，SSE 流式透传）。`aiService` 提供 `callAI`（非流式，120s 超时 / 180s 空闲超时）与 `callAIStream`（SSE）；两条路径都捕获 token 用量，由 `tokenUsageService` 记录并在 `/token-stats` 汇总。AI Profile 支持多配置 CRUD，持久化到服务端。

### 数据持久化与 LAN 同步

双通道：`client-storage` 承载整包快照（含旧格式迁移）；tags / annotations / concept-cards / quizzes / read-meta 等有端点专属 JSON 文件。合并策略：annotations 与 concept cards 按 ID，tags 按名称，read-meta / read-history 按时间戳（新者优先）。所有文件集中在工作区 `data/` 目录，多客户端指向同一目录即获得 LAN 同步，无中心服务器。

### 标注系统

iframe 内文本选择经 `contentWindow.getSelection()` 捕获，`trimRangeEdges` 去尾随空白后序列化为 XPath + 偏移。恢复时三级降级：精确 XPath 解析 → 空白归一化匹配 → 相似度 ≥70% 的滑动窗口模糊匹配。跨元素选区用 `splitText` + 包裹避免 DOM 破坏。

### 间隔重复（SM-2）

概念卡由 AI 从文档提取（`conceptService`），`conceptCardStore.sm2Review` 实现 SM-2 调度：grade 0–5，间隔 1 → 6 → N×efactor 天，grade <3 重置为 1，间隔 ≥21 天视为"已掌握"。卡片按文档来源随工作区隔离。

## 主要 API 端点（`documentDiscovery` 插件）

| 端点 | 用途 |
|---|---|
| `GET /api/documents` | 富化文档清单（1s 缓存） |
| `/dev-docs/:path*` | 开发模式文档静态服务 |
| `POST /api/ai/chat/completions` | 本地 LLM 代理（SSE） |
| `/api/ai/config` · `/api/ai/models` · `/api/ai/tts` | AI Profile、模型列表、TTS |
| `/api/client-storage` | 客户端整包快照同步（GET/POST，含迁移） |
| `/api/tags` · `/api/annotations` · `/api/concept-cards` · `/api/quizzes` · `/api/read-meta` · `/api/read-history` | 端点专属数据文件 CRUD |
| `/api/workspaces` · `/api/browse-directories` | 工作区配置与目录浏览 |
| `/api/fetch-url` · `/api/import-url` · `/api/imported-doc` | 网页抓取、导入与导入文档服务 |
| `/api/move-workspace-document` · `/api/move-workspace-category` · `/api/bulk-delete-documents` | 文档/分类移动与批量删除 |
| `/api/search-images` · `/api/proxy-image` | 图片搜索与代理 |
| `/api/code-run` · `/api/code-runtimes` | 代码编辑器运行时 |

## 相关文档

- [DESIGN.md](DESIGN.md) —— 设计决策与关键算法（SM-2、XPath 序列化、状态管理模式）
- [DEPLOY.md](DEPLOY.md) —— 构建与部署指南
- [CLAUDE.md](../CLAUDE.md) —— 面向编码代理的仓库指南

## 架构图的再生成

规格 JSON 是唯一事实源，修改后用 archify 重新交付（`--repo-root` 用于校验图中引用的源码路径）：

```bash
cd ~/.zcode/skills/archify
D=/path/to/InsightHub/docs/diagrams
node bin/archify.mjs deliver architecture $D/insighthub-architecture.json $D/insighthub-architecture.html --quality showcase --repo-root /path/to/InsightHub --json
node bin/archify.mjs deliver workflow     $D/startup-workflow.json        $D/startup-workflow.html        --quality showcase --json
node bin/archify.mjs deliver sequence     $D/ai-request-sequence.json     $D/ai-request-sequence.html     --quality showcase --json
node bin/archify.mjs deliver dataflow     $D/persistence-dataflow.json    $D/persistence-dataflow.html    --quality showcase --json
```
