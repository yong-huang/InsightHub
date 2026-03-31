import { create } from 'zustand'
import type { Tag } from '@/types'
import { storageService } from '@/services/storageService'

const DEFAULT_COLORS = [
  '#326ce5', '#4ecdc4', '#ff8c42', '#ff6b6b', '#a78bfa',
  '#fbbf24', '#34d399', '#f472b6', '#60a5fa', '#c084fc',
]

function syncTagsToServer(tags: Tag[]): void {
  fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tags) }).catch(() => {})
}

interface TagState {
  tags: Tag[]
  loadTags: () => void
  addTag: (name: string, documentId: string) => Tag
  removeTag: (tagId: string) => void
  addDocumentToTag: (tagId: string, documentId: string) => void
  removeDocumentFromTag: (tagId: string, documentId: string) => void
  getTagsForDocument: (documentId: string) => Tag[]
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],

  loadTags: () => {
    const localTags = storageService.getTags()
    set({ tags: localTags })
    // Merge from server
    fetch('/api/tags')
      .then(r => r.json())
      .then((serverTags: Tag[]) => {
        const localMap = new Map(localTags.map(t => [t.id, t]))
        const merged = [...serverTags]
        for (const t of localTags) {
          if (!merged.find(s => s.id === t.id)) merged.push(t)
        }
        storageService.setTags(merged)
        set({ tags: merged })
      })
      .catch(() => {})
  },

  addTag: (name, documentId) => {
    const { tags } = get()
    const id = `tag-${Date.now()}`
    const color = DEFAULT_COLORS[tags.length % DEFAULT_COLORS.length]
    const newTag: Tag = { id, name, color, documentIds: [documentId] }
    const updated = [...tags, newTag]
    storageService.setTags(updated)
    syncTagsToServer(updated)
    set({ tags: updated })
    return newTag
  },

  removeTag: (tagId) => {
    const updated = get().tags.filter(t => t.id !== tagId)
    storageService.setTags(updated)
    syncTagsToServer(updated)
    set({ tags: updated })
  },

  addDocumentToTag: (tagId, documentId) => {
    const updated = get().tags.map(t => {
      if (t.id === tagId && !t.documentIds.includes(documentId)) {
        return { ...t, documentIds: [...t.documentIds, documentId] }
      }
      return t
    })
    storageService.setTags(updated)
    syncTagsToServer(updated)
    set({ tags: updated })
  },

  removeDocumentFromTag: (tagId, documentId) => {
    const updated = get().tags.map(t => {
      if (t.id === tagId) {
        return { ...t, documentIds: t.documentIds.filter(id => id !== documentId) }
      }
      return t
    }).filter(t => t.documentIds.length > 0)
    storageService.setTags(updated)
    syncTagsToServer(updated)
    set({ tags: updated })
  },

  getTagsForDocument: (documentId) => {
    return get().tags.filter(t => t.documentIds.includes(documentId))
  },
}))
