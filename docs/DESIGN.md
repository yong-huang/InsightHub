# InsightHub - 系统设计文档

**版本**: v1.0
**日期**: 2026-03-29
**状态**: Draft

---

## 1. 技术选型

### 1.1 技术栈

| 层面 | 选型 | 理由 |
|------|------|------|
| **框架** | React 18 + TypeScript | 组件化开发，类型安全，生态丰富 |
| **构建工具** | Vite 6 | 极快的 HMR 和构建速度，原生 ESM 支持 |
| **路由** | React Router v7 | 声明式路由，支持嵌套路由和动态加载 |
| **状态管理** | Zustand | 轻量、简洁、TypeScript 友好，无 boilerplate |
| **全文搜索** | FlexSearch | 纯前端全文搜索引擎，零依赖，支持中文 |
| **UI 组件** | 手写 CSS (CSS Modules) | 参考模板风格，高度定制化，无需引入重型 UI 库 |
| **HTTP 请求** | fetch API (原生) | 仅需对接本地 AI 模型 API，无需额外库 |
| **数据持久化** | localStorage + 自定义封装 | 无需后端，纯前端方案 |
| **代码高亮** | Prism.js (文档内 iframe 自带) | 原始文档已内嵌代码高亮 |
| **图标** | Lucide React | 轻量 SVG 图标库，风格现代 |

### 1.2 为什么不用 Next.js / 全栈框架

- 文档系统不需要 SSR（没有 SEO 需求，纯个人使用）
- 不需要后端服务器（AI API 为本地已有的 HTTP 服务）
- 原始 HTML 文档通过 iframe 嵌入，需要静态文件服务
- Vite dev server 和 build 即可满足所有需求

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Client)                      │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  React SPA   │  │  FlexSearch  │  │  localStorage  │  │
│  │  (UI Layer)  │  │  (Search)    │  │  (Persistence) │  │
│  └──────┬──────┘  └──────────────┘  └────────────────┘  │
│         │                    │                            │
│  ┌──────┴────────────────────┴──────────────────────┐    │
│  │              Zustand Store (State)                │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │    │
│  │  │ documents│ │  search  │ │  quiz / ai       │  │    │
│  │  │  store   │ │  store   │ │  store           │  │    │
│  │  └──────────┘ └──────────┘ └──────────────────┘  │    │
│  └───────────────────────────────────────────────────┘    │
│         │                              │                   │
│         ▼                              ▼                   │
│  ┌─────────────┐              ┌──────────────────┐        │
│  │ Static Files│              │  Local AI Model  │        │
│  │ (HTML docs) │              │  Qwen3.5-27B     │        │
│  │ via iframe  │              │  :7001/v1        │        │
│  └─────────────┘              └──────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
dochub/
├── public/
│   ├── docs/                          # 文档文件（构建时复制）
│   │   ├── mindinsight/               # MindInsight 文档
│   │   │   ├── academic/
│   │   │   ├── film-analysis/
│   │   │   ├── literature/
│   │   │   └── philosophy/
│   │   └── techinsight/               # TechInsight 文档
│   │       ├── programming/
│   │       ├── ai-ml/
│   │       ├── cloud/
│   │       ├── infrastructure/
│   │       ├── storage/
│   │       ├── algorithms/
│   │       └── vendors/
│   └── favicon.svg
│
├── src/
│   ├── main.tsx                       # 应用入口
│   ├── App.tsx                        # 根组件，路由配置
│   ├── vite-env.d.ts
│   │
│   ├── components/                    # 通用 UI 组件
│   │   ├── Layout/
│   │   │   ├── Navbar.tsx             # 顶部导航栏
│   │   │   ├── Sidebar.tsx            # 侧边栏（分类+标签）
│   │   │   └── Footer.tsx
│   │   ├── Search/
│   │   │   ├── SearchBar.tsx          # 全局搜索栏
│   │   │   ├── SearchDialog.tsx       # 搜索弹窗 (Cmd+K)
│   │   │   ├── SearchResults.tsx      # 搜索结果列表
│   │   │   └── SearchSuggestions.tsx  # 搜索建议
│   │   ├── Document/
│   │   │   ├── DocCard.tsx            # 文档卡片
│   │   │   ├── DocGrid.tsx            # 文档网格
│   │   │   ├── DocViewer.tsx          # iframe 文档查看器
│   │   │   ├── DocMeta.tsx            # 文档元信息
│   │   │   └── CategorySection.tsx    # 分类区块
│   │   ├── Filter/
│   │   │   ├── FilterBar.tsx          # 筛选栏
│   │   │   ├── CategoryFilter.tsx     # 分类筛选器
│   │   │   ├── TagFilter.tsx          # 标签筛选器
│   │   │   └── StatusFilter.tsx       # 阅读状态筛选
│   │   ├── Tag/
│   │   │   ├── TagBadge.tsx           # 标签徽章
│   │   │   ├── TagCloud.tsx           # 标签云
│   │   │   └── TagManager.tsx         # 标签管理弹窗
│   │   ├── Quiz/
│   │   │   ├── QuizPanel.tsx          # 习题面板
│   │   │   ├── QuestionCard.tsx       # 题目卡片
│   │   │   ├── AnswerForm.tsx         # 答题表单
│   │   │   ├── ScoreBoard.tsx         # 评分面板
│   │   │   └── QuizHistory.tsx        # 习题历史
│   │   └── common/
│   │       ├── ProgressBar.tsx
│   │       ├── StatCard.tsx
│   │       ├── ThemeToggle.tsx
│   │       └── Modal.tsx
│   │
│   ├── pages/                         # 页面组件
│   │   ├── HomePage.tsx               # 首页仪表盘
│   │   ├── CategoryPage.tsx           # 分类浏览页
│   │   ├── SearchPage.tsx             # 搜索结果页
│   │   ├── DocReaderPage.tsx          # 文档阅读页
│   │   └── QuizPage.tsx               # AI 练习页
│   │
│   ├── stores/                        # Zustand 状态管理
│   │   ├── documentStore.ts           # 文档数据
│   │   ├── searchStore.ts             # 搜索状态
│   │   ├── tagStore.ts                # 标签数据
│   │   ├── quizStore.ts               # 习题数据
│   │   └── preferenceStore.ts         # 用户偏好
│   │
│   ├── services/                      # 业务逻辑层
│   │   ├── documentService.ts         # 文档解析与索引
│   │   ├── searchService.ts           # FlexSearch 封装
│   │   ├── aiService.ts               # AI API 对接
│   │   ├── quizService.ts             # 习题生成与评分逻辑
│   │   └── storageService.ts          # localStorage 封装
│   │
│   ├── hooks/                         # 自定义 Hooks
│   │   ├── useDocuments.ts
│   │   ├── useSearch.ts
│   │   ├── useQuiz.ts
│   │   └── useKeyboard.ts             # 键盘快捷键
│   │
│   ├── types/                         # TypeScript 类型定义
│   │   └── index.ts                   # 所有接口定义
│   │
│   ├── utils/                         # 工具函数
│   │   ├── htmlParser.ts              # HTML 解析（提取标题、纯文本）
│   │   ├── categoryMap.ts             # 分类映射配置
│   │   ├── defaultTags.ts             # 默认标签定义
│   │   └── format.ts                  # 格式化工具
│   │
│   └── styles/                        # 全局样式
│       ├── globals.css                # CSS 变量、全局样式、主题
│       ├── animations.css             # 动画定义
│       └── markdown.css               # 文档内 markdown 渲染
│
├── scripts/
│   └── copy-docs.ts                   # 构建时复制文档到 public/
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── DOCKER_ENV                        # 文档路径配置（见 2.3 节）
```

### 2.3 文档来源配置

文档不从项目内部存储，而是通过**符号链接或构建脚本**引用源目录。这样文档内容变更无需重新部署前端代码。

**方案：Vite alias + 构建时复制**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@docs-mindinsight': path.resolve(process.env.MINDINSIGHT_PATH || '../MindInsight'),
      '@docs-techinsight': path.resolve(process.env.TECHINSIGHT_PATH || '../TechInsight'),
    },
  },
  server: {
    fs: { allow: ['..'] }, // 允许访问上级目录
  },
});
```

运行时通过 fetch 加载 HTML 文档内容：

```
GET /@docs-mindinsight/academic/critical-thinking.html
```

**备选方案：构建时复制到 public/**

```typescript
// scripts/copy-docs.ts
// 在 build 前执行，将两个目录复制到 public/docs/
```

---

## 3. 核心模块设计

### 3.1 文档解析与索引模块

**职责**：扫描文档目录，解析 HTML 提取元数据，构建全文搜索索引。

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐
│  HTML 文件 │ ──→ │ HTML Parser │ ──→ │ Document 对象  │
│          │     │  (DOMParser)│     │  (metadata +  │
│          │     └─────────────┘     │   full text)  │
│          │                         └──────┬───────┘
│          │                                │
│          │                                ▼
│          │                         ┌──────────────┐
│          │                         │  FlexSearch  │
│          │                         │   Index      │
│          │                         └──────────────┘
└──────────┘
```

**HTML 解析流程**：

```typescript
// services/documentService.ts

interface ParseResult {
  title: string;
  subtitle: string;
  contentText: string;      // 去除 HTML 标签的纯文本
  sections: string[];       // 各 section 的标题列表
  wordCount: number;
  language: 'zh' | 'en' | 'mixed';
}

function parseHtmlDocument(htmlString: string): ParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // 1. 提取标题
  const title = doc.querySelector('title')?.textContent || '';
  const h1 = doc.querySelector('h1')?.textContent || '';

  // 2. 提取纯文本（排除 script/style/nav/footer）
  const body = doc.body;
  const excludeSelectors = 'script, style, nav, footer, header';
  body.querySelectorAll(excludeSelectors).forEach(el => el.remove());
  const contentText = body.textContent?.trim() || '';

  // 3. 提取 section 标题
  const sections = Array.from(doc.querySelectorAll('h2, h3'))
    .map(el => el.textContent?.trim() || '');

  // 4. 统计字数（中文按字，英文按词）
  const wordCount = countWords(contentText);

  // 5. 检测语言
  const language = detectLanguage(contentText);

  return { title, subtitle: h1, contentText, sections, wordCount, language };
}
```

**索引构建**：

```typescript
// services/searchService.ts
import FlexSearch from 'flexsearch';

export class SearchEngine {
  private index: FlexSearch.Index;

  constructor() {
    this.index = new FlexSearch.Index({
      tokenize: 'forward',        // 前向分词（适合中文前缀匹配）
      charset: 'latin:extra',      // 扩展拉丁字符集
      charset_preset: 'chinese',   // 中文分词预设
      async: true,
    });
  }

  async addDocument(doc: Document): Promise<void> {
    await this.index.add(doc.id, `${doc.title} ${doc.subtitle} ${doc.contentText}`);
  }

  async search(query: string, limit = 20): Promise<string[]> {
    return this.index.search(query, { limit });
  }
}
```

### 3.2 搜索模块

**职责**：封装全文搜索，支持模糊匹配、中文搜索、搜索建议。

```typescript
// stores/searchStore.ts

interface SearchState {
  query: string;
  results: Document[];
  isSearching: boolean;
  history: SearchHistory[];
  suggestions: Document[];

  // Actions
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  addToHistory: (query: string, count: number) => void;
  getSuggestions: (query: string) => Promise<void>;
}
```

**搜索交互流程**：

```
用户输入关键词
      │
      ▼
┌─────────────┐    200ms debounce
│  Input      │ ─────────────────→ FlexSearch.search()
│  onChange    │                        │
└─────────────┘                        ▼
      │                          ┌──────────┐
      │                          │ 结果列表  │
      │                          │ (建议)    │
      │                          └──────────┘
      │
      ▼ (Enter / 点击搜索)
┌─────────────┐
│  搜索结果页  │
│  全量结果 +  │
│  关键词高亮  │
└─────────────┘
```

### 3.3 标签模块

**职责**：标签的 CRUD、文档-标签关联、标签筛选。

```typescript
// stores/tagStore.ts

interface TagState {
  tags: Tag[];
  documentTags: Record<string, string[]>;  // docId → tagIds

  // Actions
  addTag: (name: string, color?: string) => void;
  removeTag: (tagId: string) => void;
  updateTag: (tagId: string, updates: Partial<Tag>) => void;
  addTagToDocument: (docId: string, tagId: string) => void;
  removeTagFromDocument: (docId: string, tagId: string) => void;
  getDocumentsByTag: (tagId: string) => Document[];
}
```

### 3.4 AI 服务模块

**职责**：对接本地 AI 模型，处理习题生成和评分。

```typescript
// services/aiService.ts

const AI_CONFIG = {
  baseUrl: 'http://127.0.0.1:7001/v1',
  apiKey: '123456',
  model: 'Qwen3.5-27B-4bit',
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIResponse {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

async function callAI(messages: ChatMessage[]): Promise<AIResponse> {
  const response = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: AI_CONFIG.model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    usage: data.usage,
  };
}
```

**习题生成流程**：

```
用户点击 "生成习题"
        │
        ▼
┌──────────────────┐
│ 1. 检查文档内容    │  ← 从文档索引获取 contentText
│    截取关键段落    │  ← 超长文档取前 8000 字
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. 构建出题 Prompt │  ← 见 PRD 3.5.1 节
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. 调用 AI API    │  ← callAI()
│    等待响应       │  ← 显示 loading 状态
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 4. 解析 JSON 响应  │  ← 验证格式、修复常见错误
│    创建 Quiz 对象  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 5. 存储并展示     │  ← 保存到 localStorage + quizStore
└──────────────────┘
```

**评分流程**：

```
用户提交答案
      │
      ▼
┌──────────────────┐
│ 1. 收集答案       │  ← answers: { [questionId]: userAnswer }
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. 构建评分 Prompt │  ← 见 PRD 3.5.2 节
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. 调用 AI 评分   │  ← 选择题/判断题可本地直接判
│    (混合评分策略)  │    简答题需 AI 评分
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 4. 计算总分       │
│    展示评分报告    │
└──────────────────┘
```

**混合评分策略（优化性能）**：

- **选择题 & 判断题**：客户端本地比较答案，无需调用 AI（即时反馈）
- **简答题**：调用 AI API 进行语义评分（需等待）
- **并行评分**：所有简答题答案一次性发送给 AI，减少 API 调用次数

```typescript
// services/quizService.ts

function gradeQuestion(question: Question, userAnswer: string): number {
  // 选择题和判断题本地评分
  if (question.type === 'choice' || question.type === 'truefalse') {
    const normalizedAnswer = userAnswer.trim().toUpperCase();
    const correctAnswer = question.answer.trim().toUpperCase();
    return normalizedAnswer === correctAnswer ? 10 : 0;
  }
  // 简答题返回 -1 表示需要 AI 评分
  return -1;
}
```

### 3.5 存储模块

**职责**：localStorage 的封装，提供类型安全的读写、自动 JSON 序列化。

```typescript
// services/storageService.ts

const STORAGE_KEYS = {
  PREFERENCES: 'insighthub:preferences',
  READ_RECORDS: 'insighthub:read-records',
  TAGS: 'insighthub:tags',
  DOCUMENT_TAGS: 'insighthub:document-tags',
  QUIZZES: 'insighthub:quizzes',
  SEARCH_HISTORY: 'insighthub:search-history',
} as const;

class StorageService {
  get<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }

  clear(): void {
    Object.values(STORAGE_KEYS).forEach(key => this.remove(key));
  }

  getStorageSize(): number {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('insighthub:')) {
        total += (localStorage.getItem(key) || '').length;
      }
    }
    return total;
  }
}
```

---

## 4. 前端路由设计

```typescript
// App.tsx

<Routes>
  <Route element={<Layout />}>
    {/* 首页 */}
    <Route index element={<HomePage />} />

    {/* 按来源浏览 */}
    <Route path="mindinsight" element={<CategoryPage source="mindinsight" />} />
    <Route path="techinsight" element={<CategoryPage source="techinsight" />} />

    {/* 按分类浏览 */}
    <Route path="mindinsight/:category" element={<CategoryPage source="mindinsight" />} />
    <Route path="techinsight/:category" element={<CategoryPage source="techinsight" />} />

    {/* 搜索 */}
    <Route path="search" element={<SearchPage />} />
    <Route path="search?q=:query" element={<SearchPage />} />

    {/* 文档阅读 */}
    <Route path="doc/:docId" element={<DocReaderPage />} />

    {/* AI 练习 */}
    <Route path="quiz/:quizId" element={<QuizPage />} />

    {/* 标签筛选 */}
    <Route path="tag/:tagId" element={<CategoryPage />} />
  </Routes>
</Routes>
```

---

## 5. CSS 设计系统

### 5.1 CSS 变量定义

```css
/* styles/globals.css */

:root {
  /* ---- Colors ---- */
  --color-primary: #326ce5;
  --color-primary-light: #5b8def;
  --color-primary-dark: #2457b5;

  --color-accent-green: #4ecdc4;
  --color-accent-orange: #ff8c42;
  --color-accent-red: #ff6b6b;
  --color-accent-purple: #a78bfa;
  --color-accent-yellow: #fbbf24;

  /* ---- Surfaces ---- */
  --bg-primary: #f8f9fc;
  --bg-secondary: #ffffff;
  --bg-card: #ffffff;
  --bg-hover: rgba(50, 108, 229, 0.06);
  --bg-overlay: rgba(26, 26, 46, 0.5);

  /* ---- Text ---- */
  --text-primary: #1a1a2e;
  --text-secondary: #5a5a6e;
  --text-dim: #8a8a9e;
  --text-inverse: #ffffff;

  /* ---- Borders ---- */
  --border-color: rgba(0, 0, 0, 0.08);
  --border-radius-sm: 8px;
  --border-radius-md: 12px;
  --border-radius-lg: 16px;
  --border-radius-pill: 9999px;

  /* ---- Shadows ---- */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 24px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.1);

  /* ---- Spacing ---- */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;

  /* ---- Typography ---- */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;
  --text-4xl: 2.5rem;

  /* ---- Transitions ---- */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 400ms ease;

  /* ---- Layout ---- */
  --navbar-height: 64px;
  --sidebar-width: 280px;
  --max-content-width: 1280px;
}

/* Dark Theme */
[data-theme="dark"] {
  --bg-primary: #0a0a0c;
  --bg-secondary: #12121a;
  --bg-card: #1a1a24;
  --bg-hover: rgba(91, 141, 239, 0.1);
  --bg-overlay: rgba(0, 0, 0, 0.7);

  --text-primary: #e8e8ed;
  --text-secondary: #9a9ab0;
  --text-dim: #6a6a7e;

  --border-color: rgba(255, 255, 255, 0.08);
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 24px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.4);
}
```

### 5.2 动画系统

```css
/* styles/animations.css */

/* 滚动触发 reveal 动画 */
.reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

/* 延迟类 */
.reveal-delay-1 { transition-delay: 100ms; }
.reveal-delay-2 { transition-delay: 200ms; }
.reveal-delay-3 { transition-delay: 300ms; }
.reveal-delay-4 { transition-delay: 400ms; }

/* 卡片 hover */
.card-hover {
  transition: transform var(--transition-normal), box-shadow var(--transition-normal);
}
.card-hover:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

/* 渐变文字 */
.gradient-text {
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 进度条动画 */
@keyframes progress-fill {
  from { width: 0; }
}

/* 脉冲效果 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## 6. 状态管理设计

### 6.1 Store 依赖关系

```
┌────────────────┐
│ preferenceStore │  ← 全局设置（主题、习题偏好）
└───────┬────────┘
        │
┌───────┴────────┐
│ documentStore   │  ← 文档索引、阅读记录
└───────┬────────┘
        │
   ┌────┴────┐
   │         │
┌──┴───┐ ┌──┴──────┐
│tagStore│ │searchStore│  ← 标签关联、搜索索引
└──────┘ └──────────┘
                   │
             ┌─────┴──────┐
             │  quizStore  │  ← 习题数据（依赖 documentStore）
             └────────────┘
```

### 6.2 documentStore 核心

```typescript
// stores/documentStore.ts

interface DocumentState {
  documents: Document[];
  isLoading: boolean;
  isIndexed: boolean;
  filters: {
    source?: 'mindinsight' | 'techinsight';
    category?: string;
    tag?: string;
    status?: 'all' | 'read' | 'unread';
    searchQuery?: string;
  };

  // Actions
  loadDocuments: () => Promise<void>;
  setFilter: (filter: Partial<DocumentState['filters']>) => void;
  clearFilters: () => void;
  getFilteredDocuments: () => Document[];
  markAsRead: (docId: string) => void;
  getDocumentById: (id: string) => Document | undefined;
  getStats: () => DocStats;
}
```

---

## 7. 初始化与构建流程

### 7.1 应用启动流程

```
App Mount
    │
    ├─→ 1. 从 localStorage 加载用户偏好 (preferenceStore)
    │      └─→ 应用主题 (light/dark)
    │
    ├─→ 2. 从 localStorage 加载标签数据 (tagStore)
    │
    ├─→ 3. 扫描文档目录，构建文档索引 (documentStore)
    │      ├─→ fetch 每个 HTML 文件
    │      ├─→ 解析 HTML 提取元数据
    │      ├─→ 合并 localStorage 中的阅读记录
    │      └─→ 构建 FlexSearch 索引
    │
    ├─→ 4. 加载搜索历史 (searchStore)
    │
    ├─→ 5. 加载习题记录 (quizStore)
    │
    └─→ 6. 渲染完成，显示首页
```

### 7.2 文档目录清单

构建时需要知道文档的完整列表。采用**清单文件**方式：

```typescript
// utils/documentManifest.ts

const DOCUMENT_MANIFEST: DocumentManifestEntry[] = [
  // MindInsight
  { source: 'mindinsight', category: 'academic', file: 'academic/critical-thinking.html' },
  { source: 'mindinsight', category: 'academic', file: 'academic/english-grammar.html' },
  // ... (由脚本自动生成或手动维护)
];

// 开发时可调用后端接口列出目录文件
// 或使用 Vite 的 import.meta.glob 动态导入
```

**推荐方案：import.meta.glob**

```typescript
// 利用 Vite 的 glob import 获取所有文档
const docFiles = import.meta.glob('/public/docs/**/*.html', { eager: false });
// 返回 { '/public/docs/mindinsight/academic/xxx.html': () => Promise<...> }
```

---

## 8. 性能优化策略

### 8.1 文档加载优化

| 策略 | 说明 |
|------|------|
| **索引预构建** | 首次加载时解析所有文档并缓存索引到 localStorage，后续直接使用 |
| **按需加载** | 文档正文内容（contentText）仅在需要时加载，索引只存储标题和摘要 |
| **Web Worker** | 文档解析和索引构建放入 Web Worker，不阻塞 UI 线程 |
| **增量索引** | 通过对比文件修改时间，仅重新解析变更的文档 |

### 8.2 搜索优化

| 策略 | 说明 |
|------|------|
| **输入防抖** | 搜索建议 200ms debounce |
| **缓存结果** | 相同关键词的搜索结果缓存 5 分钟 |
| **前缀匹配** | FlexSearch 的 forward tokenize 模式 |

### 8.3 AI 调用优化

| 策略 | 说明 |
|------|------|
| **文档截断** | 超长文档取前 8000 字发送，避免超出 token 限制 |
| **混合评分** | 客观题本地评分，减少 AI 调用量 |
| **流式输出** | 习题生成使用 SSE 流式返回，提升用户体验 |
| **错误重试** | AI 不可用时自动重试 2 次，间隔 2 秒 |
| **超时控制** | 单次 API 调用超时 60 秒 |

---

## 9. 错误处理

### 9.1 错误类型与处理

| 错误场景 | 处理方式 |
|---------|---------|
| AI 服务不可用 | 显示友好提示，建议检查服务状态，客观题仍可本地评分 |
| AI 返回格式异常 | 尝试 JSON 修复，失败则提示"生成失败，请重试" |
| localStorage 满了 | 提示清理旧数据，支持导出后清理 |
| 文档加载失败 | 显示错误占位，提供重试按钮 |
| 网络中断 | Service Worker 缓存 + 离线提示 |

---

## 10. 安全考虑

| 风险 | 缓解措施 |
|------|---------|
| XSS (iframe 嵌入) | sandbox 属性限制 iframe 权限 |
| API Key 暴露 | 前端存储无法完全避免，但本地模型无外网暴露风险 |
| 数据篡改 | localStorage 数据可被篡改，但纯个人使用场景可接受 |
| 内容安全 | 使用 sandbox iframe 隔离外部文档的 JS 执行 |
