import { create } from 'zustand'
import type { Annotation } from '@/types'
import { storageService } from '@/services/storageService'
import { useFlashcardStore } from '@/stores/flashcardStore'
import { fetchDocumentManifest, type DocumentManifestEntry } from '@/utils/documentManifest'

function syncAnnotationsToServer(annotations: Annotation[]): void {
  fetch('/api/annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(annotations),
  }).catch(() => {})
}

/**
 * Migrate annotation documentIds that reference old (reorganized) document paths.
 * Uses fileName matching — same strategy as documentStore's meta migration.
 */
async function migrateAnnotationDocIds(annotations: Annotation[]): Promise<Annotation[]> {
  try {
    const manifest: DocumentManifestEntry[] = await fetchDocumentManifest()
    const currentIds = new Set(manifest.map(e => e.id))

    let changed = false
    const updated = annotations.map(a => {
      if (currentIds.has(a.documentId)) return a
      // Match by fileName stem — e.g. "ti-job-powerstore-interview-preparation"
      // ends with "powerstore-interview-preparation" which matches a manifest entry
      const match = manifest.find(e => a.documentId.endsWith(e.fileName.replace(/\.html$/, '')))
      if (match) {
        changed = true
        return { ...a, documentId: match.id }
      }
      return a
    })

    if (changed) {
      storageService.setAnnotations(updated)
      syncAnnotationsToServer(updated)
    }
    return updated
  } catch {
    return annotations
  }
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
      .then(async (serverAnnotations: Annotation[]) => {
        const merged = [...serverAnnotations]
        for (const a of localAnnotations) {
          if (!merged.find(s => s.id === a.id)) merged.push(a)
        }
        // Migrate orphaned documentIds (files moved between directories)
        const migrated = await migrateAnnotationDocIds(merged)
        storageService.setAnnotations(migrated)
        set({ annotations: migrated })
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
    // Mark corresponding flashcard as source-deleted
    useFlashcardStore.getState().markSourceDeleted(id)
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
