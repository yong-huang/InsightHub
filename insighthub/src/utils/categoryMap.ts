import type { Source, WorkspaceConfig } from '@/types'

export interface CategoryEntry {
  key: string
  label: string
  source: Source
  icon: string
}

export type Workspace = Source

export const DEFAULT_WORKSPACE_META: Record<Workspace, { label: string; subtitle: string; icon: string; gradientClass: string; basePath: string }> = {
  mindinsight: { label: 'MindInsight', subtitle: 'Mind & Insight', icon: 'Brain', gradientClass: 'gradient-text-warm', basePath: '/mindinsight' },
  techinsight: { label: 'TechInsight', subtitle: 'Tech & Insight', icon: 'Cpu', gradientClass: 'gradient-text', basePath: '/techinsight' },
  leetcodeinsight: { label: 'LeetcodeInsight', subtitle: 'Algorithm Mastery', icon: 'Code2', gradientClass: 'gradient-text-green', basePath: '/leetcodeinsight' },
}

/** Backward-compatible alias — existing code can still import WORKSPACE_META */
export const WORKSPACE_META = DEFAULT_WORKSPACE_META

/** Build dynamic WORKSPACE_META from WorkspaceConfig[] */
export function buildWorkspaceMeta(workspaces: WorkspaceConfig[]): Record<Workspace, { label: string; subtitle: string; icon: string; gradientClass: string; basePath: string }> {
  const meta: Record<string, { label: string; subtitle: string; icon: string; gradientClass: string; basePath: string }> = {}
  for (const ws of workspaces) {
    meta[ws.id] = {
      label: ws.label,
      subtitle: '',
      icon: ws.icon,
      gradientClass: 'gradient-text',
      basePath: `/${ws.id}`,
    }
  }
  return meta
}

/** Keep WORKSPACE_META for backward compat — reads from preferenceStore at call time */
export function getWorkspaceMeta(activeWorkspace: string, workspaces: WorkspaceConfig[]) {
  const ws = workspaces.find(w => w.id === activeWorkspace)
  if (ws) {
    return {
      label: ws.label,
      subtitle: '',
      icon: ws.icon,
      gradientClass: 'gradient-text',
      basePath: `/${ws.id}`,
    }
  }
  return DEFAULT_WORKSPACE_META[activeWorkspace] || {
    label: activeWorkspace,
    subtitle: '',
    icon: 'FileText',
    gradientClass: 'gradient-text',
    basePath: `/${activeWorkspace}`,
  }
}

export const CATEGORIES: CategoryEntry[] = [
  // MindInsight — General Knowledge → Humanities → Practical
  { key: 'academic', label: 'Academic Foundations', source: 'mindinsight', icon: 'GraduationCap' },
  { key: 'philosophy', label: 'Philosophy', source: 'mindinsight', icon: 'Brain' },
  { key: 'history', label: 'History', source: 'mindinsight', icon: 'Landmark' },
  { key: 'literature', label: 'Literature', source: 'mindinsight', icon: 'BookOpen' },
  { key: 'media-analysis', label: 'Media Analysis', source: 'mindinsight', icon: 'Film' },
  { key: 'pop-culture', label: 'Pop Culture', source: 'mindinsight', icon: 'Monitor' },
  { key: 'finance', label: 'Finance', source: 'mindinsight', icon: 'TrendingUp' },
  // TechInsight — Fundamentals → Advanced → Infrastructure → Career
  { key: 'programming', label: 'Programming', source: 'techinsight', icon: 'Code' },
  { key: 'linux', label: 'Linux', source: 'techinsight', icon: 'TerminalSquare' },
  { key: 'algorithms', label: 'Algorithms', source: 'techinsight', icon: 'GitBranch' },
  { key: 'dl-fundamentals', label: 'Deep Learning', source: 'techinsight', icon: 'Sparkles' },
  { key: 'ai-frameworks', label: 'AI Frameworks', source: 'techinsight', icon: 'Cpu' },
  { key: 'architecture', label: 'System Architecture', source: 'techinsight', icon: 'Building2' },
  { key: 'devops', label: 'DevOps', source: 'techinsight', icon: 'Terminal' },
  { key: 'cloud', label: 'Cloud Platforms', source: 'techinsight', icon: 'Cloud' },
  { key: 'kubernetes', label: 'Container Orchestration', source: 'techinsight', icon: 'Container' },
  { key: 'networking', label: 'Networking', source: 'techinsight', icon: 'Wifi' },
  { key: 'storage', label: 'Storage', source: 'techinsight', icon: 'HardDrive' },
  { key: 'vmware', label: 'VMware', source: 'techinsight', icon: 'Server' },
  { key: 'dell', label: 'Dell Solutions', source: 'techinsight', icon: 'Database' },
  { key: 'job', label: 'Job Interview', source: 'techinsight', icon: 'Briefcase' },
  // LeetcodeInsight — Basic Data Structures → Algorithms → Comprehensive
  { key: 'two-pointers', label: 'Two Pointers', source: 'leetcodeinsight', icon: 'MoveHorizontal' },
  { key: 'sliding-window', label: 'Sliding Window', source: 'leetcodeinsight', icon: 'PanelLeftClose' },
  { key: 'linked-list', label: 'Linked List', source: 'leetcodeinsight', icon: 'Link' },
  { key: 'stack', label: 'Stack', source: 'leetcodeinsight', icon: 'Archive' },
  { key: 'hashmap', label: 'HashMap', source: 'leetcodeinsight', icon: 'Table2' },
  { key: 'binary-search', label: 'Binary Search', source: 'leetcodeinsight', icon: 'Binary' },
  { key: 'backtracking', label: 'Backtracking', source: 'leetcodeinsight', icon: 'Undo2' },
  { key: 'dynamic-programming', label: 'Dynamic Programming', source: 'leetcodeinsight', icon: 'Puzzle' },
  { key: 'strings', label: 'Strings', source: 'leetcodeinsight', icon: 'Type' },
  { key: 'math', label: 'Math', source: 'leetcodeinsight', icon: 'Calculator' },
  { key: 'summary', label: 'Summary', source: 'leetcodeinsight', icon: 'FileText' },
]

export function getCategoryInfo(key: string): CategoryEntry | undefined {
  return CATEGORIES.find(c => c.key === key)
}

export function getCategoriesBySource(source: Source): CategoryEntry[] {
  return CATEGORIES.filter(c => c.source === source)
}

const SOURCE_LABELS: Record<string, string> = {
  mindinsight: 'MindInsight · Mind & Insight',
  techinsight: 'TechInsight · Tech & Insight',
  leetcodeinsight: 'LeetcodeInsight · Algorithm Mastery',
}

export function getSourceLabel(source: Source): string {
  return SOURCE_LABELS[source] || source
}

export function getSourceFromCategory(category: string): Source {
  const cat = CATEGORIES.find(c => c.key === category)
  return cat?.source ?? 'techinsight'
}
