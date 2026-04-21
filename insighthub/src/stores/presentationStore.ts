import { create } from 'zustand'
import { storageService } from '@/services/storageService'
import type { Presentation } from '@/types'

interface PresentationStore {
  presentations: Presentation[]
  loadPresentations: () => void
  savePresentation: (presentation: Presentation) => void
  deletePresentation: (id: string) => void
  updateSlideOrder: (id: string, slideOrder: number[]) => void
  updateSpeakerNotes: (id: string, slideIndex: number, notes: string) => void
  getByDocumentId: (documentId: string) => Presentation | undefined
}

export const usePresentationStore = create<PresentationStore>((set, get) => ({
  presentations: [],

  loadPresentations: () => {
    const stored = storageService.getPresentations()
    set({ presentations: stored })
  },

  savePresentation: (presentation) => {
    const updated = { ...presentation, updatedAt: Date.now() }
    const existing = get().presentations.findIndex(p => p.id === presentation.id)
    const list = [...get().presentations]

    if (existing >= 0) {
      list[existing] = updated
    } else {
      list.unshift(updated)
    }

    storageService.setPresentations(list)
    set({ presentations: list })
  },

  deletePresentation: (id) => {
    const list = get().presentations.filter(p => p.id !== id)
    storageService.setPresentations(list)
    set({ presentations: list })
  },

  updateSlideOrder: (id, slideOrder) => {
    const list = get().presentations.map(p =>
      p.id === id ? { ...p, slideOrder, updatedAt: Date.now() } : p
    )
    storageService.setPresentations(list)
    set({ presentations: list })
  },

  updateSpeakerNotes: (id, slideIndex, notes) => {
    const list = get().presentations.map(p => {
      if (p.id !== id) return p
      return {
        ...p,
        speakerNotes: { ...p.speakerNotes, [slideIndex]: notes },
        updatedAt: Date.now(),
      }
    })
    storageService.setPresentations(list)
    set({ presentations: list })
  },

  getByDocumentId: (documentId) => {
    return get().presentations.find(p => p.documentId === documentId)
  },
}))
