import { create } from 'zustand'
import type { Annotation } from '@/types'
import { storageService } from '@/services/storageService'

function syncAnnotationsToServer(annotations: Annotation[]): void {
  fetch('/api/annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(annotations),
  }).catch(() => {})
}

interface AnnotationState {
  annotations: Annotation[]
  loadAnnotations: () => void
  addAnnotation: (annotation: Annotation) => void
  removeAnnotation: (id: string) => void
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void
  getAnnotationsForDocument: (documentId: string) => Annotation[]
  getCommentCount: () => number
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: [],

  loadAnnotations: () => {
    const localAnnotations = storageService.getAnnotations() as Annotation[]
    set({ annotations: localAnnotations })
    fetch('/api/annotations')
      .then(r => r.json())
      .then((serverAnnotations: Annotation[]) => {
        const localIds = new Set(localAnnotations.map(a => a.id))
        const merged = [...serverAnnotations]
        for (const a of localAnnotations) {
          if (!merged.find(s => s.id === a.id)) merged.push(a)
        }
        storageService.setAnnotations(merged)
        set({ annotations: merged })
      })
      .catch(() => {})
  },

  addAnnotation: (annotation) => {
    const updated = [...get().annotations, annotation]
    storageService.setAnnotations(updated)
    syncAnnotationsToServer(updated)
    set({ annotations: updated })
  },

  removeAnnotation: (id) => {
    const updated = get().annotations.filter(a => a.id !== id)
    storageService.setAnnotations(updated)
    syncAnnotationsToServer(updated)
    set({ annotations: updated })
  },

  updateAnnotation: (id, updates) => {
    const updated = get().annotations.map(a =>
      a.id === id ? { ...a, ...updates } : a
    )
    storageService.setAnnotations(updated)
    syncAnnotationsToServer(updated)
    set({ annotations: updated })
  },

  getAnnotationsForDocument: (documentId) => {
    return get().annotations.filter(a => a.documentId === documentId)
  },

  getCommentCount: (workspace?: string) => {
    return get().annotations.filter(a => {
      if (a.type !== 'comment') return false
      if (workspace) return a.documentId.startsWith(workspace + '-')
      return true
    }).length
  },
}))
