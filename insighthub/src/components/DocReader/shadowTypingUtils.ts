export interface TutorMessage {
  role: 'ai' | 'user'
  content: string
  refs?: string[]
}

export const SHADOW_STORAGE_KEY = 'insighthub:shadow-history'

/** Extract [ref:...] from the end of a string */
export function parseRefs(text: string): { content: string; refs: string[] } {
  const match = text.match(/\[ref:(.+?)\]\s*$/)
  if (!match) return { content: text, refs: [] }
  const refs = match[1].split(',').map(s => s.trim()).filter(Boolean)
  return { content: text.slice(0, match.index).trimEnd(), refs }
}

/** Filter refs by document content (exact phrase or any word >= 3 chars exists) */
export function validateRefs(refs: string[], fullDocText: string): string[] {
  const fullDoc = fullDocText.toLowerCase()
  return refs.filter(r => {
    if (fullDoc.includes(r.toLowerCase())) return true
    const words = r.split(/\s+/).filter(w => w.length >= 3)
    return words.some(w => fullDoc.includes(w.toLowerCase()))
  })
}

export function loadShadowHistory(docId: string): TutorMessage[] {
  try {
    const all = JSON.parse(localStorage.getItem(SHADOW_STORAGE_KEY) || '{}')
    return all[docId] || []
  } catch { return [] }
}

export function saveShadowHistory(docId: string, messages: TutorMessage[]) {
  try {
    const all = JSON.parse(localStorage.getItem(SHADOW_STORAGE_KEY) || '{}')
    all[docId] = messages.slice(-60)
    localStorage.setItem(SHADOW_STORAGE_KEY, JSON.stringify(all))
  } catch { /* quota exceeded */ }
}

export function clearShadowHistory(docId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SHADOW_STORAGE_KEY) || '{}')
    delete all[docId]
    localStorage.setItem(SHADOW_STORAGE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

export function loadShadowData(docId: string): { position: { x: number; y: number }; size: { width: number; height: number } } {
  const DEFAULT_SIZE = { width: 480, height: 460 }
  const defaults = {
    position: { x: Math.max(40, window.innerWidth - DEFAULT_SIZE.width - 40), y: 160 },
    size: DEFAULT_SIZE,
  }
  try {
    const all = JSON.parse(localStorage.getItem('insighthub:shadow-typing') || '{}')
    const saved = all[docId]
    if (!saved) return defaults
    return {
      position: {
        x: saved.position?.x ?? defaults.position.x,
        y: Math.max(120, saved.position?.y ?? defaults.position.y),
      },
      size: saved.size || defaults.size,
    }
  } catch {
    return defaults
  }
}

export function saveShadowData(docId: string, data: Partial<{ position: { x: number; y: number }; size: { width: number; height: number } }>) {
  try {
    const all = JSON.parse(localStorage.getItem('insighthub:shadow-typing') || '{}')
    all[docId] = { ...all[docId], ...data }
    localStorage.setItem('insighthub:shadow-typing', JSON.stringify(all))
  } catch { /* quota exceeded */ }
}
