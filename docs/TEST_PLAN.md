# InsightHub - 测试计划文档

**版本**: v1.0
**日期**: 2026-03-29
**状态**: Draft

---

## 1. 测试概述

### 1.1 测试范围

本文档覆盖 InsightHub v1.0 MVP 版本的所有功能测试，包括：

- 文档浏览与阅读
- 全文搜索
- 分类筛选与标签系统
- AI 习题生成与评分
- 数据持久化
- UI/UX 交互

### 1.2 测试环境

| 环境 | 配置 |
|------|------|
| **操作系统** | macOS Darwin 25.3.0 |
| **Node.js** | >= 18.x |
| **浏览器** | Chrome 120+, Firefox 115+, Safari 17+, Edge 120+ |
| **AI 服务** | `http://127.0.0.1:7001/v1` (Qwen3.5-27B-4bit, 需 API Key, `enable_thinking: false`) |
| **文档数据** | MindInsight (59 files) + TechInsight (52 files) |

### 1.3 测试策略

| 层级 | 工具 | 覆盖范围 |
|------|------|---------|
| **单元测试** | Vitest | 工具函数、服务层、Store 逻辑 |
| **组件测试** | Vitest + React Testing Library | UI 组件渲染和交互 |
| **E2E 测试** | Playwright | 关键用户流程端到端验证 |

---

## 2. 单元测试

### 2.1 HTML 解析模块 (`htmlParser.ts`)

**文件**: `src/utils/__tests__/htmlParser.test.ts`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| UT-P01 | 解析标准 MindInsight HTML 文件 | 正确提取 title、subtitle、contentText | P0 |
| UT-P02 | 解析标准 TechInsight HTML 文件 | 正确提取 title、subtitle、contentText | P0 |
| UT-P03 | 提取 section 标题列表 | 返回所有 h2/h3 标题的数组 | P0 |
| UT-P04 | 统计文档字数（中文文档） | 按字符数统计，排除空白和标点 | P0 |
| UT-P05 | 统计文档字数（英文文档） | 按单词数统计 | P0 |
| UT-P06 | 检测文档语言（纯中文） | 返回 `'zh'` | P1 |
| UT-P07 | 检测文档语言（纯英文） | 返回 `'en'` | P1 |
| UT-P08 | 检测文档语言（中英混合） | 返回 `'mixed'` | P1 |
| UT-P09 | 排除 script/style 标签内容 | contentText 不含 JavaScript 和 CSS 代码 | P0 |
| UT-P10 | 排除 nav/footer 标签内容 | contentText 不含导航和页脚文本 | P0 |
| UT-P11 | 处理无 title 标签的 HTML | title 返回空字符串，不抛错 | P0 |
| UT-P12 | 处理空 HTML 文件 | 所有字段返回合理默认值 | P0 |
| UT-P13 | 处理含特殊字符的文档（如三体 Problem 中的数学公式） | 不抛错，正确提取文本 | P1 |

### 2.2 搜索服务 (`searchService.ts`)

**文件**: `src/services/__tests__/searchService.test.ts`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| UT-S01 | 创建搜索索引 | FlexSearch 实例正确初始化 | P0 |
| UT-S02 | 添加文档到索引 | 文档可被搜索到 | P0 |
| UT-S03 | 中文关键词搜索 "批判性思维" | 返回包含该关键词的文档 | P0 |
| UT-S04 | 英文关键词搜索 "Kubernetes" | 返回包含该关键词的文档 | P0 |
| UT-S05 | 模糊搜索 "kubernete" | 能匹配到包含 "Kubernetes" 的文档 | P0 |
| UT-S06 | 搜索不存在的关键词 | 返回空数组 | P0 |
| UT-S07 | 搜索空字符串 | 返回空数组或所有文档 | P0 |
| UT-S08 | 搜索结果数量限制 | 返回结果不超过 limit 参数 | P1 |
| UT-S09 | 按标题搜索 "Python" | 优先返回标题中含 Python 的文档 | P1 |
| UT-S10 | 按内容搜索 "container" | 返回正文中含 container 的文档 | P1 |

### 2.3 AI 服务 (`aiService.ts`)

**文件**: `src/services/__tests__/aiService.test.ts`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| UT-A01 | 正确构建 API 请求 | URL、headers、body 格式正确 | P0 |
| UT-A02 | 成功响应解析 | 正确提取 content 和 usage | P0 |
| UT-A03 | API 返回 401 错误 | 抛出带状态码的 Error | P0 |
| UT-A04 | API 返回 500 错误 | 抛出带状态码的 Error | P0 |
| UT-A05 | 网络超时处理 | 超时后抛出 TimeoutError | P0 |
| UT-A06 | 网络不可达 | 抛出 NetworkError | P0 |
| UT-A07 | 响应 JSON 格式异常 | 优雅处理，不崩溃 | P1 |
| UT-A08 | 空响应处理 | 抛出合理的 Error | P1 |

### 2.4 习题服务 (`quizService.ts`)

**文件**: `src/services/__tests__/quizService.test.ts`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| UT-Q01 | 选择题本地评分（答案正确） | 返回 10 分 | P0 |
| UT-Q02 | 选择题本地评分（答案错误） | 返回 0 分 | P0 |
| UT-Q03 | 选择题本地评分（大小写不敏感） | 返回 10 分 | P0 |
| UT-Q04 | 判断题本地评分（答案正确） | 返回 10 分 | P0 |
| UT-Q05 | 判断题本地评分（答案错误） | 返回 0 分 | P0 |
| UT-Q06 | 简答题评分标记 | 返回 -1，标记需 AI 评分 | P0 |
| UT-Q07 | 解析 AI 返回的 JSON 习题 | 正确解析为 Question 数组 | P0 |
| UT-Q08 | AI 返回非标准 JSON | 尝试修复，失败返回错误 | P1 |
| UT-Q09 | AI 返回缺少必要字段 | 抛出验证错误，提示哪些字段缺失 | P1 |
| UT-Q10 | 文档内容截断（超长文档） | 截断到 8000 字，不丢失开头内容 | P1 |
| UT-Q11 | 构建出题 Prompt | Prompt 包含文档内容和要求 | P0 |
| UT-Q12 | 构建评分 Prompt | Prompt 包含题目和用户答案 | P0 |
| UT-Q13 | 计算总分 | 正确汇总各题分数 | P0 |

### 2.5 存储服务 (`storageService.ts`)

**文件**: `src/services/__tests__/storageService.test.ts`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| UT-ST01 | 写入和读取数据 | 读取值与写入值一致 | P0 |
| UT-ST02 | 读取不存在的 key | 返回 defaultValue | P0 |
| UT-ST03 | 删除数据 | 后续读取返回 defaultValue | P0 |
| UT-ST04 | 清空所有 insighthub 数据 | 所有 key 被移除 | P0 |
| UT-ST05 | 存储损坏的 JSON | 捕获异常，返回 defaultValue | P0 |
| UT-ST06 | 计算存储大小 | 返回正确的字节数 | P1 |
| UT-ST07 | 大数据写入（112 篇文档索引） | 不报错，数据完整 | P0 |

### 2.6 分类映射 (`categoryMap.ts`)

**文件**: `src/utils/__tests__/categoryMap.test.ts`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| UT-C01 | MindInsight 所有分类映射 | 每个目录正确映射到显示名 | P0 |
| UT-C02 | TechInsight 所有分类映射 | 每个目录正确映射到显示名 | P0 |
| UT-C03 | 未知分类处理 | 返回默认显示名或原目录名 | P1 |
| UT-C04 | 获取所有分类列表 | 返回完整的分类配置数组 | P0 |

---

## 3. 组件测试

### 3.1 SearchBar / SearchDialog

**文件**: `src/components/Search/__tests__/SearchBar.test.tsx`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| CT-SB01 | 渲染搜索栏 | 显示搜索输入框和图标 | P0 |
| CT-SB02 | 输入关键词 | onChange 回调触发，显示搜索建议 | P0 |
| CT-SB03 | 按 Enter 搜索 | 触发搜索提交 | P0 |
| CT-SB04 | 点击搜索图标 | 触发搜索提交 | P0 |
| CT-SB05 | Cmd+K 快捷键 | 打开搜索弹窗 | P0 |
| CT-SB06 | Esc 关闭搜索弹窗 | 弹窗关闭 | P0 |
| CT-SB07 | 搜索建议列表显示 | 显示匹配的文档标题 | P1 |
| CT-SB08 | 搜索建议点击 | 导航到对应文档 | P1 |

### 3.2 DocCard / DocGrid

**文件**: `src/components/Document/__tests__/DocCard.test.tsx`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| CT-DC01 | 渲染文档卡片 | 显示标题、分类、标签 | P0 |
| CT-DC02 | 已读文档标记 | 显示已读图标 | P0 |
| CT-DC03 | 未读文档样式 | 无已读图标 | P0 |
| CT-DC04 | 点击卡片 | 导航到文档阅读页 | P0 |
| CT-DC05 | 标签显示 | 正确渲染所有标签 | P0 |
| CT-DC06 | 无标签文档 | 不显示标签区域 | P1 |

### 3.3 DocViewer

**文件**: `src/components/Document/__tests__/DocViewer.test.tsx`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| CT-DV01 | 渲染 iframe | 正确加载文档 URL | P0 |
| CT-DV02 | iframe sandbox 属性 | iframe 具有 sandbox 限制 | P1 |
| CT-DV03 | 加载失败处理 | 显示错误提示和重试按钮 | P0 |
| CT-DV04 | 进度条更新 | 滚动时进度条同步更新 | P1 |

### 3.4 FilterBar

**文件**: `src/components/Filter/__tests__/FilterBar.test.tsx`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| CT-FB01 | 渲染筛选栏 | 显示所有筛选器 | P0 |
| CT-FB02 | 选择分类 | 文档列表按分类筛选 | P0 |
| CT-FB03 | 选择标签 | 文档列表按标签筛选 | P0 |
| CT-FB04 | 多条件组合筛选 | 同时按分类和标签筛选 | P0 |
| CT-FB05 | 清除所有筛选 | 恢复显示所有文档 | P0 |
| CT-FB06 | 无匹配结果 | 显示"暂无匹配文档"提示 | P0 |

### 3.5 QuizPanel / QuestionCard

**文件**: `src/components/Quiz/__tests__/QuizPanel.test.tsx`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| CT-QP01 | 渲染习题面板 | 显示题目、选项 | P0 |
| CT-QP02 | 选择题选项选择 | 选中状态高亮 | P0 |
| CT-QP03 | 判断题选择 | 选中"正确"或"错误" | P0 |
| CT-QP04 | 简答题输入 | 显示文本输入框 | P0 |
| CT-QP05 | 上一题/下一题导航 | 题目切换 | P0 |
| CT-QP06 | 题目进度显示 | 显示当前题号和总数 | P0 |
| CT-QP07 | 生成中状态 | 显示 loading 动画 | P0 |
| CT-QP08 | 生成失败处理 | 显示错误提示和重试按钮 | P0 |

### 3.6 ScoreBoard

**文件**: `src/components/Quiz/__tests__/ScoreBoard.test.tsx`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| CT-SC01 | 渲染评分面板 | 显示总分、各题得分 | P0 |
| CT-SB02 | 正确题目显示 | 绿色标记 | P0 |
| CT-SB03 | 错误题目显示 | 红色标记 + 解析 | P0 |
| CT-SC04 | 总评显示 | 显示 AI 总体评价 | P0 |

### 3.7 TagBadge / TagFilter

**文件**: `src/components/Tag/__tests__/TagBadge.test.tsx`

| 编号 | 测试用例 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| CT-TB01 | 渲染标签 | 显示标签名称和颜色 | P0 |
| CT-TB02 | 点击标签 | 触发筛选 | P0 |
| CT-TB03 | 移除标签 | 触发取消筛选 | P0 |

---

## 4. E2E 测试

**文件**: `e2e/` 目录

### 4.1 核心用户流程

#### 流程 1：首次访问与文档浏览

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 打开应用首页 | 页面加载完成，显示统计卡片和文档网格 |
| 2 | 查看统计数据 | 总文档数显示 112，已读 0 |
| 3 | 滚动查看 MindInsight 分类 | 显示 6 个分类卡片（学术、电影、财务、历史、文学、哲学） |
| 4 | 滚动查看 TechInsight 分类 | 显示 6 个分类卡片（编程、AI 框架、云平台等） |
| 5 | 点击"学术基础"分类 | 进入分类页，显示 26 篇文档 |
| 6 | 查看文档卡片 | 每张卡片显示标题、标签 |
| 7 | 点击一篇文档 | 进入文档阅读页，iframe 加载原文档 |
| 8 | 在文档页滚动 | 进度条随滚动更新 |
| 9 | 返回首页 | 点击返回按钮或 Logo |

#### 流程 2：搜索功能

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 在首页按 Cmd+K | 搜索弹窗打开，输入框获焦 |
| 2 | 输入 "Kubernetes" | 实时显示包含 Kubernetes 的文档建议 |
| 3 | 按 Enter | 跳转搜索结果页，显示匹配文档列表 |
| 4 | 查看搜索结果 | 关键词在结果中高亮显示 |
| 5 | 点击一条结果 | 进入文档阅读页 |
| 6 | 返回搜索结果 | 搜索结果保留 |
| 7 | 清空搜索 | 返回首页或全部文档 |

#### 流程 3：筛选与标签

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 在首页点击 "TechInsight" 分类 | 显示所有 TechInsight 文档 |
| 2 | 选择 "编程语言" 子分类 | 仅显示编程语言相关文档 |
| 3 | 点击标签 "Python" | 进一步筛选，仅显示含 Python 标签的文档 |
| 4 | 清除所有筛选 | 恢复显示全部文档 |

#### 流程 4：AI 习题生成与评分

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 打开任意文档阅读页 | 文档正常加载 |
| 2 | 滚动到文档底部 | 出现"开始练习"提示 |
| 3 | 点击"生成习题" | 显示 loading 状态 |
| 4 | 等待 AI 生成完成 | 显示 5-10 道练习题 |
| 5 | 查看题目类型 | 包含选择题、判断题、简答题 |
| 6 | 查看难度标记 | 每道题标注难度等级 |
| 7 | 逐题作答 | 选择/输入答案 |
| 8 | 点击"提交答案" | 显示评分中状态 |
| 9 | 查看评分结果 | 显示总分、各题得分、解析 |
| 10 | 查看错题解析 | 错误题目显示正确答案和解析 |
| 11 | 点击"重新出题" | 生成新的习题集 |

### 4.2 边界场景测试

| 编号 | 测试场景 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| E2E-ERR01 | AI 服务未启动时点击"生成习题" | 显示友好错误提示，建议检查服务 | P0 |
| E2E-ERR02 | AI 生成超时 | 显示超时提示，提供重试选项 | P0 |
| E2E-ERR03 | 浏览器 localStorage 已满 | 提示清理数据 | P1 |
| E2E-ERR04 | 文档 HTML 文件被删除 | 卡片显示错误状态，不影响其他文档 | P1 |
| E2E-ERR05 | 网络断开后操作 | 已加载数据可用，搜索和 AI 功能提示不可用 | P2 |

### 4.3 响应式测试

| 编号 | 测试场景 | 预期结果 | 优先级 |
|------|---------|---------|--------|
| E2E-R01 | 桌面端 (1440px) | 双栏布局，侧边栏 + 内容区 | P0 |
| E2E-R02 | 平板端 (768px) | 单栏布局，侧边栏变为顶部筛选栏 | P0 |
| E2E-R03 | 移动端 (375px) | 单栏布局，汉堡菜单，卡片单列 | P1 |
| E2E-R04 | 窗口缩放过渡 | 布局平滑过渡，无元素溢出 | P1 |

---

## 5. 性能测试

| 编号 | 测试场景 | 指标 | 通过标准 | 优先级 |
|------|---------|------|---------|--------|
| PT-01 | 首页首次加载 (冷启动) | FCP | < 1.5s | P0 |
| PT-02 | 首页首次加载 | LCP | < 2.5s | P0 |
| PT-03 | 首页二次加载 (有缓存) | FCP | < 500ms | P0 |
| PT-04 | 打开文档阅读页 | 加载时间 | < 1s | P0 |
| PT-05 | 全文搜索响应 | 搜索耗时 | < 300ms | P0 |
| PT-06 | 搜索建议显示延迟 | 输入到建议出现 | < 500ms | P0 |
| PT-07 | 索引构建时间 (112 文档) | 构建耗时 | < 5s | P1 |
| PT-08 | AI 习题生成 | API 响应时间 | < 30s | P1 |
| PT-09 | localStorage 读写 | 读写延迟 | < 10ms | P1 |
| PT-10 | 页面内存占用 | JS Heap | < 100MB | P2 |

---

## 6. 兼容性测试矩阵

### 6.1 浏览器兼容

| 浏览器 | 版本 | 首页 | 搜索 | 文档阅读 | AI 习题 | 标签 |
|--------|------|------|------|---------|---------|------|
| Chrome | 120+ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Firefox | 115+ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Safari | 17+ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edge | 120+ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 6.2 iframe 兼容性

| 场景 | 说明 | 预期 |
|------|------|------|
| 暗色主题文档嵌入亮色主题平台 | 文档自带暗色 CSS | 文档样式不受平台主题影响 |
| 文档内交互 (排序动画等) | 文档含 JS 动画 | 动画正常运行 |
| 文档内代码块 | 语法高亮 | 正常显示 |
| 文档内导航 | 文档自己的锚点导航 | 正常跳转 |

---

## 7. 测试数据准备

### 7.1 Mock AI 响应

为不依赖本地 AI 服务运行测试，提供标准 mock 响应：

```typescript
// src/services/__tests__/mocks/ai-responses.ts

export const MOCK_QUIZ_RESPONSE = {
  questions: [
    {
      id: 1,
      type: 'choice',
      difficulty: 'easy',
      question: 'Kubernetes 的最小调度单位是什么？',
      options: ['A. Container', 'B. Pod', 'C. Node', 'D. Cluster'],
      answer: 'B',
      explanation: 'Pod 是 Kubernetes 中最小的可调度单元...',
    },
    {
      id: 2,
      type: 'truefalse',
      difficulty: 'medium',
      question: 'Kubernetes 使用 YAML 文件来声明资源的期望状态。',
      answer: '正确',
      explanation: 'YAML 是 Kubernetes 中声明式配置的主要格式...',
    },
    {
      id: 3,
      type: 'short_answer',
      difficulty: 'hard',
      question: '请描述 Kubernetes 控制面的主要组件及其职责。',
      answer: 'kube-apiserver, etcd, kube-scheduler, kube-controller-manager, cloud-controller-manager',
      explanation: '控制面负责集群的全局决策和响应集群事件...',
    },
  ],
};

export const MOCK_SCORING_RESPONSE = {
  results: [
    { question_id: 1, score: 10, feedback: '完全正确！' },
    { question_id: 2, score: 10, feedback: '回答正确，理解到位。' },
    { question_id: 3, score: 7, feedback: '答对了主要组件，但缺少各组件职责的详细描述。' },
  ],
  total_score: 27,
  summary: '基础概念掌握扎实，建议补充控制面组件的职责细节。',
};
```

### 7.2 Mock HTML 文档

```typescript
// src/services/__tests__/mocks/sample-documents.ts

export const MOCK_MINDINSIGHT_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Critical Thinking - MindInsight</title>
  <style>body { font-family: Inter, sans-serif; }</style>
</head>
<body>
  <nav>导航栏</nav>
  <h1>Critical Thinking 批判性思维</h1>
  <h2>什么是批判性思维</h2>
  <div class="content-box">
    <p>批判性思维是一种有目的的、自我调节的判断能力...</p>
  </div>
  <h2>批判性思维的核心要素</h2>
  <div class="content-box">
    <p>包括分析、评估、推理、解释和自我调节五个核心要素...</p>
  </div>
  <footer>Part of the MindInsight series</footer>
</body>
</html>`;

export const MOCK_TECHINSIGHT_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kubernetes Deployment Patterns - TechInsight</title>
</head>
<body>
  <h1>Kubernetes Declarative Deployment</h1>
  <section>
    <h2>Imperative vs Declarative</h2>
    <p>Declarative approach defines the desired state...</p>
  </section>
</body>
</html>`;
```

---

## 8. 测试执行计划

### 8.1 测试阶段

| 阶段 | 时间 | 范围 | 负责方 |
|------|------|------|--------|
| **Phase 1: 单元测试** | 开发过程中同步编写 | 工具函数、服务层 | 开发者 |
| **Phase 2: 组件测试** | 组件开发完成后 | UI 组件 | 开发者 |
| **Phase 3: E2E 测试** | 功能联调后 | 关键用户流程 | 开发者 |
| **Phase 4: 性能测试** | 功能冻结后 | 性能指标验证 | 开发者 |
| **Phase 5: 回归测试** | 每次发布前 | 全量测试 | 开发者 |

### 8.2 CI 集成（建议）

```yaml
# .github/workflows/test.yml (可选)
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
    - run: npm test -- --coverage
    - run: npm run test:e2e
```

### 8.3 测试命令

```bash
# 运行所有单元测试和组件测试
npm test

# 运行测试并生成覆盖率报告
npm test -- --coverage

# 运行特定文件的测试
npm test -- src/services/__tests__/aiService.test.ts

# 监听模式（开发时使用）
npm test -- --watch

# 运行 E2E 测试
npm run test:e2e

# 运行 E2E 测试（带 UI）
npm run test:e2e -- --ui

# 运行性能测试
npm run test:performance
```

---

## 9. 缺陷管理

### 9.1 严重级别定义

| 级别 | 定义 | 响应时间 | 修复时限 |
|------|------|---------|---------|
| **P0 - Blocker** | 核心功能完全不可用 | 立即 | 24h |
| **P1 - Critical** | 核心功能部分受损 | 4h | 48h |
| **P2 - Major** | 非核心功能异常 | 1d | 下个版本 |
| **P3 - Minor** | UI 微调、体验优化 | 3d | 顺延修复 |

### 9.2 缺陷报告模板

```markdown
## 缺陷标题

**环境**: Chrome 120 / macOS 14
**复现步骤**:
1. ...
2. ...
3. ...

**预期结果**: ...
**实际结果**: ...
**截图/录屏**: (如有)
**附加信息**: 控制台日志、网络请求等
```

---

## 10. 验收标准 (Acceptance Criteria)

### v1.0 MVP 发布需满足

| 编号 | 验收标准 | 状态 |
|------|---------|------|
| AC-01 | 112 篇文档全部可浏览和阅读 | ☐ |
| AC-02 | 全文搜索返回准确结果，响应 < 300ms | ☐ |
| AC-03 | 分类筛选正确过滤文档 | ☐ |
| AC-04 | 标签筛选正确过滤文档 | ☐ |
| AC-05 | AI 习题成功生成，格式正确 | ☐ |
| AC-06 | AI 评分返回准确分数和解析 | ☐ |
| AC-07 | 阅读记录正确持久化到 localStorage | ☐ |
| AC-08 | 首页加载 < 2s (冷启动) | ☐ |
| AC-09 | AI 服务不可用时优雅降级 | ☐ |
| AC-10 | 单元测试覆盖率 > 80% | ☐ |
| AC-11 | Chrome, Firefox, Safari 基本功能正常 | ☐ |
| AC-12 | 无 P0/P1 级别缺陷 | ☐ |
