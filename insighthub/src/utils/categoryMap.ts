import type { Source } from '@/types'

export interface CategoryEntry {
  key: string
  label: string
  source: Source
  icon: string
}

export type Workspace = Source

export const WORKSPACE_META: Record<Workspace, { label: string; subtitle: string; icon: string; gradientClass: string; basePath: string }> = {
  mindinsight: { label: 'MindInsight', subtitle: '思想洞察', icon: 'Brain', gradientClass: 'gradient-text-warm', basePath: '/mindinsight' },
  techinsight: { label: 'TechInsight', subtitle: '技术洞察', icon: 'Cpu', gradientClass: 'gradient-text', basePath: '/techinsight' },
  leetcodeinsight: { label: 'LeetcodeInsight', subtitle: '算法精练', icon: 'Code2', gradientClass: 'gradient-text-green', basePath: '/leetcodeinsight' },
} as const

export const CATEGORIES: CategoryEntry[] = [
  // MindInsight — 通识→人文→实用
  { key: 'academic', label: '学术基础', source: 'mindinsight', icon: 'GraduationCap' },
  { key: 'philosophy', label: '哲学思辨', source: 'mindinsight', icon: 'Brain' },
  { key: 'history', label: '历史纵览', source: 'mindinsight', icon: 'Landmark' },
  { key: 'literature', label: '文学鉴赏', source: 'mindinsight', icon: 'BookOpen' },
  { key: 'media-analysis', label: '媒体分析', source: 'mindinsight', icon: 'Film' },
  { key: 'pop-culture', label: '流行文化', source: 'mindinsight', icon: 'Monitor' },
  { key: 'finance', label: '财务分析', source: 'mindinsight', icon: 'TrendingUp' },
  // TechInsight — 基础→进阶→基础设施→职业
  { key: 'programming', label: '编程语言', source: 'techinsight', icon: 'Code' },
  { key: 'linux', label: 'Linux', source: 'techinsight', icon: 'TerminalSquare' },
  { key: 'algorithms', label: '算法精讲', source: 'techinsight', icon: 'GitBranch' },
  { key: 'dl-fundamentals', label: '深度学习', source: 'techinsight', icon: 'Sparkles' },
  { key: 'ai-frameworks', label: 'AI 框架', source: 'techinsight', icon: 'Cpu' },
  { key: 'architecture', label: '系统架构', source: 'techinsight', icon: 'Building2' },
  { key: 'devops', label: 'DevOps', source: 'techinsight', icon: 'Terminal' },
  { key: 'cloud', label: '云平台', source: 'techinsight', icon: 'Cloud' },
  { key: 'kubernetes', label: '容器编排', source: 'techinsight', icon: 'Container' },
  { key: 'networking', label: '网络', source: 'techinsight', icon: 'Wifi' },
  { key: 'storage', label: '存储技术', source: 'techinsight', icon: 'HardDrive' },
  { key: 'vmware', label: 'VMware', source: 'techinsight', icon: 'Server' },
  { key: 'dell', label: 'Dell 方案', source: 'techinsight', icon: 'HardDrive' },
  { key: 'job', label: '求职面试', source: 'techinsight', icon: 'Briefcase' },
  // LeetcodeInsight — 基础数据结构→算法→综合
  { key: 'arrays', label: '数组', source: 'leetcodeinsight', icon: 'Layers' },
  { key: 'strings', label: '字符串', source: 'leetcodeinsight', icon: 'Type' },
  { key: 'linked-list', label: '链表', source: 'leetcodeinsight', icon: 'Link' },
  { key: 'stack', label: '栈', source: 'leetcodeinsight', icon: 'Archive' },
  { key: 'math', label: '数学', source: 'leetcodeinsight', icon: 'Calculator' },
  { key: 'binary-search', label: '二分查找', source: 'leetcodeinsight', icon: 'Search' },
  { key: 'dynamic-programming', label: '动态规划', source: 'leetcodeinsight', icon: 'Puzzle' },
  { key: 'summary', label: '总结汇总', source: 'leetcodeinsight', icon: 'FileText' },
]

export function getCategoryInfo(key: string): CategoryEntry | undefined {
  return CATEGORIES.find(c => c.key === key)
}

export function getCategoriesBySource(source: Source): CategoryEntry[] {
  return CATEGORIES.filter(c => c.source === source)
}

const SOURCE_LABELS: Record<Source, string> = {
  mindinsight: 'MindInsight · 思想洞察',
  techinsight: 'TechInsight · 技术洞察',
  leetcodeinsight: 'LeetcodeInsight · 算法精练',
}

export function getSourceLabel(source: Source): string {
  return SOURCE_LABELS[source]
}

export function getSourceFromCategory(category: string): Source {
  const cat = CATEGORIES.find(c => c.key === category)
  return cat?.source ?? 'techinsight'
}
