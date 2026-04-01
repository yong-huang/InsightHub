# InsightHub - 系统设计文档

**版本**: v2.0
**日期**: 2026-04-01
**状态**: Implemented

---

## 1. 技术选型

| 层面 | 选型 | 理由 |
|------|------|------|
| **框架** | React 19 + TypeScript | 组件化开发，类型安全 |
| **构建工具** | Vite 6 | 极快的 HMR 和构建速度 |
| **路由** | React Router v7 | 声明式路由，支持嵌套路由 |
| **状态管理** | Zustand 5 | 轻量、TypeScript 友好 |
| **全文搜索** | FlexSearch | 纯前端全文搜索，零依赖 |
| **UI** | 手写 CSS (Custom Properties) | 高度定制化 |
| **HTTP** | fetch API (原生) | 对接本地 AI API |
| **数据持久化** | localStorage + 服务端 JSON | 本地优先 + LAN 同步 |
| **图标** | Lucide React | 轻量 SVG 图标库 |

---

## 2. 系统架构

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                      Browser (Client)                         │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  React SPA   │  │  FlexSearch  │  │    localStorage    │  │
│  │  (UI Layer)  │  │  (Search)    │  │    (Local Cache)   │  │
│  └──────┬──────┘  └──────────────┘  └────────────────────┘  │
│         │                                                     │
│  ┌──────┴────────────────────────────────────────────────┐    │
│  │                Zustand Store (State)                   │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────┐ ┌──────────┐    │    │
│  │  │ documents│ │  search  │ │ quiz │ │annotation│    │    │
│  │  │  store   │ │  store   │ │store │ │  store   │    │    │
│  │  └──────────┘ └──────────┘ └──────┘ └──────────┘    │    │
│  └───────────────────────────────────────────────────────┘    │
│         │              │                  │                    │
│         ▼              ▼                  ▼                    │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐      │
│  │Static Files │ │Vite Dev API │ │  Local AI Model  │      │
│  │(HTML docs)  │ │(sync, config│ │  Qwen3.5-27B     │      │
│  │ via iframe  │ │  endpoints) │ │  :7001/v1        │      │
│  └─────────────┘ └─────────────┘ └──────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 数据同步

所有用户数据通过 localStorage 本地优先 + 服务端 JSON 文件 LAN 同步：
- `localStorage` 为主存储，读写无延迟
- Vite dev server 提供 `/api/*` 端点，持久化到 `.insighthub-*.json`
- 应用启动时从服务端合并数据，增量变更时同步到服务端
- 构建后部署时，annotations 等数据不包含在构建产物中

### 2.3 目录结构

```
insighthub/
├── src/
│   ├── main.tsx                       # 应用入口
│   ├── App.tsx                        # 根组件，路由配置
│   │
│   ├── pages/                         # 页面组件
│   │   ├── HomePage.tsx               # 首页仪表盘
│   │   ├── CategoryPage.tsx           # 分类浏览页
│   │   ├── DocReaderPage.tsx          # 文档阅读页（含笔记功能）
│   │   ├── SearchPage.tsx             # 搜索结果页
│   │   ├── QuizPage.tsx               # AI 测验页
│   │   ├── NotesPage.tsx              # 笔记管理页
│   │   └── SettingsPage.tsx           # 设置页
│   │
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Layout.tsx             # 布局容器
│   │   │   ├── Navbar.tsx              # 顶部导航栏
│   │   │   └── Sidebar.tsx            # 侧边栏（分类+标签+笔记）
│   │   ├── DocReader/
│   │   │   ├── AnnotationBar.tsx       # 高亮/批注浮动工具栏
│   │   │   ├── AnnotationPanel.tsx     # 笔记侧面板
│   │   │   └── CommentDialog.tsx       # 批注输入弹窗
│   │   ├── search/
│   │   │   └── SearchDialog.tsx       # 搜索弹窗 (Cmd+K)
│   │   └── shared/
│   │       ├── DocCard.tsx             # 文档卡片
│   │       ├── DocGrid.tsx             # 文档网格
│   │       ├── ErrorBoundary.tsx       # 错误边界
│   │       ├── FilterBar.tsx           # 筛选栏
│   │       ├── LoadingScreen.tsx       # 加载屏幕
│   │       └── StatCard.tsx            # 统计卡片
│   │
│   ├── stores/                        # Zustand 状态管理
│   │   ├── documentStore.ts            # 文档数据
│   │   ├── searchStore.ts              # 搜索状态
│   │   ├── tagStore.ts                 # 标签数据
│   │   ├── quizStore.ts                # 测验数据
│   │   ├── annotationStore.ts          # 笔记/高亮数据
│   │   └── preferenceStore.ts          # 用户偏好
│   │
│   ├── services/
│   │   ├── aiService.ts                # AI API 客户端（SSE 流式）
│   │   ├── quizService.ts              # 测验生成与评分逻辑
│   │   ├── searchService.ts            # FlexSearch 封装
│   │   └── storageService.ts           # localStorage 封装
│   │
│   ├── hooks/
│   │   ├── useAnnotationIframe.ts      # iframe 笔记交互（选区检测、高亮渲染）
│   │   ├── useDocumentUrl.ts           # 文档 URL 切换（dev/prod）
│   │   ├── useInitializeApp.ts         # 应用初始化
│   │   ├── useKeyboard.ts              # 全局快捷键
│   │   └── useReveal.ts                # 滚动显示动画
│   │
│   ├── types/
│   │   └── index.ts                    # 所有 TypeScript 接口定义
│   │
│   ├── utils/
│   │   ├── categoryMap.ts              # 分类定义与查找
│   │   ├── documentManifest.ts         # 动态文档清单
│   │   ├── htmlParser.ts               # HTML → 元数据提取
│   │   └── xpath.ts                    # Range ↔ XPath 序列化（笔记位置持久化）
│   │
│   └── styles/
│       ├── globals.css                 # CSS 变量、重置、全局样式
│       ├── layout.css                  # 布局样式（navbar、sidebar）
│       ├── components.css              # 组件样式
│       ├── doc-reader.css              # 文档阅读器样式
│       └── animations.css              # 动画定义
│
├── vite-plugins/
│   └── documentDiscovery.ts           # Vite 插件：文档发现 + API 端点
│
├── scripts/
│   ├── copy-docs.ts                   # 构建时复制文档到 public/
│   └── lib/
│       └── scanDocuments.ts            # 文档目录扫描
│
├── index.html
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── eslint.config.js
└── package.json
```

---

## 3. 核心模块设计

### 3.1 文档发现与加载

**Vite 插件** (`documentDiscovery.ts`)：
- 扫描 MindInsight / TechInsight 源目录，提供 `/api/documents` 清单接口
- 通过 `/dev-docs/` 在开发时直接代理原始 HTML 文件
- 提供 `/api/tags`、`/api/annotations`、`/api/quizzes` 等 LAN 同步端点
- AI 代理 `/api/ai/chat/completions`，通过 `/api/ai/config` 管理 API 配置

**启动数据流** (`useInitializeApp`)：
```
preferenceStore.setTheme → documentStore.initializeDocuments
  → tagStore.loadTags → searchStore.loadHistory
  → quizStore.loadHistory + loadSavedQuizzes
  → preferenceStore.loadQuizSettingsFromServer
  → annotationStore.loadAnnotations
```

### 3.2 笔记/高亮系统

**数据模型** (`types/index.ts`)：
```typescript
interface Annotation {
  id: string
  documentId: string
  type: 'highlight' | 'comment'
  text: string           // 被高亮的文本
  comment?: string       // 用户批注
  color: string          // 高亮颜色
  xpath: {               // 位置序列化
    startContainer: string
    endContainer: string
    startOffset: number
    endOffset: number
  }
  createdAt: number
}
```

**核心流程**：
1. 用户在 iframe 中选中文本 → 父页面通过 `contentWindow.getSelection()` 检测选区
2. 浮动工具栏出现，用户选择颜色或点击"批注"
3. Range 序列化为 XPath + 偏移量，存储到 localStorage + 服务端
4. `<mark>` 元素插入 iframe DOM（`surroundContents` 或 `extractContents`）
5. 页面刷新时，XPath 反序列化重建 Range（失败时 fallback 为文本搜索）

**恢复策略**（避免 DOM 损坏）：
- 先收集所有 ranges，再从文档底部向上依次应用
- 使用 `splitText` + wrap 代替 `extractContents`，避免跨元素范围破坏 DOM

### 3.3 AI 测验系统

- 调用本地 OpenAI 兼容 API，使用 SSE 流式响应
- 支持选择题和判断题，100 分制
- 选择题/判断题客户端本地评分，60 秒超时
- 支持重新生成、追加题目

---

## 4. 前端路由

```typescript
<Route element={<Layout />}>
  <Route path="/" element={<HomePage />} />
  <Route path="/mindinsight" element={<CategoryPage />} />
  <Route path="/mindinsight/:category" element={<CategoryPage />} />
  <Route path="/techinsight" element={<CategoryPage />} />
  <Route path="/techinsight/:category" element={<CategoryPage />} />
  <Route path="/search" element={<SearchPage />} />
  <Route path="/doc/:docId" element={<DocReaderPage />} />
  <Route path="/quiz/:quizId" element={<QuizPage />} />
  <Route path="/tag/:tagId" element={<CategoryPage />} />
  <Route path="/notes" element={<NotesPage />} />
  <Route path="/settings" element={<SettingsPage />} />
</Route>
```

---

## 5. CSS 设计系统

- CSS Custom Properties 定义主题（`globals.css`）
- `data-theme="dark"` 切换暗色主题
- 蓝紫渐变主色调，绿/橙/红/黄/紫强调色
- 卡片圆角 12px，三级阴影 sm/md/lg
- 动画系统（`animations.css`）：fadeIn、scaleIn、skeleton-loading、pulse
