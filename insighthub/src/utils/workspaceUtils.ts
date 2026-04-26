import type { WorkspaceConfig } from '@/types'

export function getWorkspaceConfig(id: string, workspaces: WorkspaceConfig[]): WorkspaceConfig | undefined {
  return workspaces.find(w => w.id === id)
}

export function getShortLabel(id: string, workspaces: WorkspaceConfig[]): string {
  const ws = workspaces.find(w => w.id === id)
  if (ws?.shortLabel) return ws.shortLabel
  if (ws?.label) {
    // Derive short label from label: "MindInsight" → "Mind", "TechInsight" → "Tech"
    const match = ws.label.match(/^([A-Z][a-z]+)/)
    return match ? match[1] : ws.label.slice(0, 4)
  }
  return 'Doc'
}

export function getPrefix(id: string, workspaces: WorkspaceConfig[]): string {
  const ws = workspaces.find(w => w.id === id)
  return ws?.prefix ? `${ws.prefix}-` : ''
}

export function getSourceColor(id: string, workspaces: WorkspaceConfig[]): string {
  const ws = workspaces.find(w => w.id === id)
  if (ws?.color) return ws.color
  // Deterministic hash fallback
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 50%)`
}

export function getSourceColorBg(id: string, workspaces: WorkspaceConfig[]): string {
  const ws = workspaces.find(w => w.id === id)
  if (ws?.colorBg) return ws.colorBg
  // Parse color and create background variant
  const color = getSourceColor(id, workspaces)
  if (color.startsWith('hsl(')) {
    return color.replace('60%, 50%)', '60%, 50%, 0.15)')
  }
  // For hex colors, try to parse
  const hex = color.replace('#', '')
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, 0.15)`
  }
  return 'rgba(50, 108, 229, 0.15)'
}

export function getGradientClass(id: string, workspaces: WorkspaceConfig[]): string {
  const ws = workspaces.find(w => w.id === id)
  return ws?.gradientClass || 'gradient-text'
}

export function getSourceLabel(id: string, workspaces: WorkspaceConfig[]): string {
  const ws = workspaces.find(w => w.id === id)
  if (!ws) return id
  return ws.subtitle ? `${ws.label} · ${ws.subtitle}` : ws.label
}

export function getSourceFromPath(pathname: string): string | undefined {
  const segment = pathname.split('/')[1]
  if (!segment || segment === '') return undefined
  return segment
}

export function isDocumentInWorkspace(docId: string, workspaceId: string, workspaces: WorkspaceConfig[]): boolean {
  const prefix = getPrefix(workspaceId, workspaces)
  if (prefix) return docId.startsWith(prefix)
  return false
}

export function getDirectoryFromSource(source: string, workspaces: WorkspaceConfig[]): string {
  const ws = workspaces.find(w => w.id === source)
  if (!ws) return source
  // Extract directory name from path: "../MindInsight" → "MindInsight"
  const parts = ws.path.replace(/^\.\.\//, '').split('/')
  return parts[0] || source
}
