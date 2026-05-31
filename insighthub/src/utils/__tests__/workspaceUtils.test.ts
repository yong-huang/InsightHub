import { describe, it, expect } from 'vitest'
import {
  getWorkspaceConfig,
  getShortLabel,
  getPrefix,
  getSourceColor,
  getSourceColorBg,
  getGradientClass,
  getSourceLabel,
  getSourceFromPath,
  isDocumentInWorkspace,
  getDirectoryFromSource,
} from '../workspaceUtils'
import type { WorkspaceConfig } from '@/types'

const workspaces: WorkspaceConfig[] = [
  {
    id: 'mindinsight',
    label: 'MindInsight',
    icon: 'Brain',
    path: '../MindInsight',
    prefix: 'mi',
    shortLabel: 'Mind',
    subtitle: 'Humanities & Social Sciences',
    gradientClass: 'gradient-mind',
    color: 'hsl(280, 60%, 50%)',
    colorBg: 'rgba(128, 0, 128, 0.15)',
  },
  {
    id: 'techinsight',
    label: 'TechInsight',
    icon: 'Cpu',
    path: '../TechInsight',
    prefix: 'ti',
  },
  {
    id: 'nolearn',
    label: 'NoLearn',
    icon: 'Book',
    path: '../NoLearn',
    prefix: '',
  },
]

describe('getWorkspaceConfig', () => {
  it('finds by id', () => {
    const result = getWorkspaceConfig('mindinsight', workspaces)
    expect(result).toBeDefined()
    expect(result!.label).toBe('MindInsight')
  })

  it('returns undefined for unknown id', () => {
    const result = getWorkspaceConfig('nonexistent', workspaces)
    expect(result).toBeUndefined()
  })
})

describe('getShortLabel', () => {
  it('uses shortLabel when available', () => {
    expect(getShortLabel('mindinsight', workspaces)).toBe('Mind')
  })

  it('derives from label (TitleCase → first word)', () => {
    expect(getShortLabel('techinsight', workspaces)).toBe('Tech')
  })

  it('falls back to first 4 chars if no match', () => {
    const ws: WorkspaceConfig[] = [
      { id: 'test', label: 'NOLEARN', icon: 'B', path: '/p', prefix: 'n' },
    ]
    expect(getShortLabel('test', ws)).toBe('NOLE')
  })

  it('falls back to "Doc" when no workspace found', () => {
    expect(getShortLabel('unknown', workspaces)).toBe('Doc')
  })
})

describe('getPrefix', () => {
  it('returns prefix with dash', () => {
    expect(getPrefix('mindinsight', workspaces)).toBe('mi-')
  })

  it('returns empty string when no prefix', () => {
    expect(getPrefix('nolearn', workspaces)).toBe('')
  })

  it('returns empty string for unknown workspace', () => {
    expect(getPrefix('unknown', workspaces)).toBe('')
  })
})

describe('getSourceColor', () => {
  it('uses ws.color when available', () => {
    expect(getSourceColor('mindinsight', workspaces)).toBe('hsl(280, 60%, 50%)')
  })

  it('deterministic hash fallback produces valid hsl', () => {
    const color = getSourceColor('techinsight', workspaces)
    expect(color).toMatch(/^hsl\(\d+, 60%, 50%\)$/)
  })

  it('same id always produces same hash', () => {
    const a = getSourceColor('techinsight', workspaces)
    const b = getSourceColor('techinsight', workspaces)
    expect(a).toBe(b)
  })

  it('different ids produce different hashes', () => {
    const a = getSourceColor('techinsight', workspaces)
    const b = getSourceColor('nolearn', workspaces)
    expect(a).not.toBe(b)
  })
})

describe('getSourceColorBg', () => {
  it('uses ws.colorBg when available', () => {
    expect(getSourceColorBg('mindinsight', workspaces)).toBe('rgba(128, 0, 128, 0.15)')
  })

  it('derives from getSourceColor with alpha for hsl', () => {
    const bg = getSourceColorBg('techinsight', workspaces)
    expect(bg).toMatch(/^hsl\(\d+, 60%, 50%, 0\.15\)$/)
  })

  it('falls back to default rgba for unknown workspace with hex color', () => {
    // When color is hex-derived and bg not set
    const ws: WorkspaceConfig[] = [
      { id: 'hex-ws', label: 'Hex', icon: 'H', path: '/h', prefix: '', color: '#aabbcc' },
    ]
    const bg = getSourceColorBg('hex-ws', ws)
    expect(bg).toMatch(/^rgba\(170, 187, 204, 0\.15\)$/)
  })
})

describe('getGradientClass', () => {
  it('uses ws.gradientClass when available', () => {
    expect(getGradientClass('mindinsight', workspaces)).toBe('gradient-mind')
  })

  it('returns default "gradient-text"', () => {
    expect(getGradientClass('techinsight', workspaces)).toBe('gradient-text')
  })
})

describe('getSourceLabel', () => {
  it('returns "label · subtitle" when subtitle exists', () => {
    expect(getSourceLabel('mindinsight', workspaces)).toBe('MindInsight · Humanities & Social Sciences')
  })

  it('returns just label when no subtitle', () => {
    expect(getSourceLabel('techinsight', workspaces)).toBe('TechInsight')
  })

  it('returns id when workspace not found', () => {
    expect(getSourceLabel('unknown', workspaces)).toBe('unknown')
  })
})

describe('getSourceFromPath', () => {
  it('extracts first path segment', () => {
    expect(getSourceFromPath('/mindinsight/python/intro')).toBe('mindinsight')
  })

  it('extracts segment from root path', () => {
    expect(getSourceFromPath('/techinsight')).toBe('techinsight')
  })

  it('returns undefined for empty path', () => {
    expect(getSourceFromPath('')).toBeUndefined()
  })

  it('returns undefined for root slash', () => {
    expect(getSourceFromPath('/')).toBeUndefined()
  })
})

describe('isDocumentInWorkspace', () => {
  it('returns true when docId starts with prefix', () => {
    expect(isDocumentInWorkspace('mi-python-intro', 'mindinsight', workspaces)).toBe(true)
  })

  it('returns false when docId has different prefix', () => {
    expect(isDocumentInWorkspace('ti-python-intro', 'mindinsight', workspaces)).toBe(false)
  })

  it('returns false when workspace has no prefix', () => {
    expect(isDocumentInWorkspace('some-doc', 'nolearn', workspaces)).toBe(false)
  })
})

describe('getDirectoryFromSource', () => {
  it('extracts directory name from path', () => {
    expect(getDirectoryFromSource('mindinsight', workspaces)).toBe('MindInsight')
  })

  it('returns source as-is when workspace not found', () => {
    expect(getDirectoryFromSource('unknown', workspaces)).toBe('unknown')
  })
})
