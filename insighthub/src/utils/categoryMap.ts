export interface CategoryEntry {
  key: string
  label: string
  source: 'mindinsight' | 'techinsight'
  icon: string
}

export type Workspace = 'mindinsight' | 'techinsight'

export const WORKSPACE_META = {
  mindinsight: { label: 'MindInsight', subtitle: '思想洞察', icon: 'Brain', gradientClass: 'gradient-text-warm', basePath: '/mindinsight' },
  techinsight: { label: 'TechInsight', subtitle: '技术洞察', icon: 'Cpu', gradientClass: 'gradient-text', basePath: '/techinsight' },
} as const

export const CATEGORIES: CategoryEntry[] = [
  // MindInsight
  { key: 'academic', label: '学术基础', source: 'mindinsight', icon: 'GraduationCap' },
  { key: 'finance', label: '财务分析', source: 'mindinsight', icon: 'TrendingUp' },
  { key: 'history', label: '历史纵览', source: 'mindinsight', icon: 'Landmark' },
  { key: 'literature', label: '文学鉴赏', source: 'mindinsight', icon: 'BookOpen' },
  { key: 'media-analysis', label: '媒体分析', source: 'mindinsight', icon: 'Film' },
  { key: 'philosophy', label: '哲学思辨', source: 'mindinsight', icon: 'Brain' },
  { key: 'pop-culture', label: '流行文化', source: 'mindinsight', icon: 'Monitor' },
  // TechInsight
  { key: 'ai-frameworks', label: 'AI 框架', source: 'techinsight', icon: 'Cpu' },
  { key: 'algorithms', label: '算法精讲', source: 'techinsight', icon: 'GitBranch' },
  { key: 'cloud', label: '云平台', source: 'techinsight', icon: 'Cloud' },
  { key: 'dell', label: 'Dell 方案', source: 'techinsight', icon: 'Server' },
  { key: 'infrastructure', label: '基础设施', source: 'techinsight', icon: 'Network' },
  { key: 'job', label: '求职面试', source: 'techinsight', icon: 'Briefcase' },
  { key: 'vmware', label: 'VMware', source: 'techinsight', icon: 'Monitor' },
  { key: 'programming', label: '编程语言', source: 'techinsight', icon: 'Code' },
]

export function getCategoryInfo(key: string): CategoryEntry | undefined {
  return CATEGORIES.find(c => c.key === key)
}

export function getCategoriesBySource(source: 'mindinsight' | 'techinsight'): CategoryEntry[] {
  return CATEGORIES.filter(c => c.source === source)
}

export function getSourceLabel(source: 'mindinsight' | 'techinsight'): string {
  return source === 'mindinsight' ? 'MindInsight · 思想洞察' : 'TechInsight · 技术洞察'
}

export function getSourceFromCategory(category: string): 'mindinsight' | 'techinsight' {
  const cat = CATEGORIES.find(c => c.key === category)
  return cat?.source ?? 'techinsight'
}
