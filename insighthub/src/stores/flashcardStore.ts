import { create } from 'zustand'
import type { Flashcard, Annotation } from '@/types'
import { storageService } from '@/services/storageService'
import {
  createCardFromAnnotation,
  reviewCard as sm2ReviewCard,
  getDueCards,
  stripHtml,
} from '@/services/spacedRepetition'

/**
 * Migrate existing cards: strip HTML from front/back, truncate highlight fronts.
 */
function migrateCards(cards: Flashcard[]): Flashcard[] {
  let changed = false
  const updated = cards.map(c => {
    const needsHtmlStrip = /<[^>]+>/.test(c.front) || /<[^>]+>/.test(c.back)
    if (!needsHtmlStrip && !(c.type === 'highlight' && c.front === c.back && !c.front.endsWith(' ...'))) {
      return c
    }
    changed = true
    let cleanBack = needsHtmlStrip ? stripHtml(c.back) : c.back
    let cleanFront = needsHtmlStrip ? stripHtml(c.front) : c.front
    // Highlight cards: truncate front, keep full text as back
    if (c.type === 'highlight' || !(c.type === 'comment' && cleanBack !== cleanFront)) {
      const maxLen = 20
      if (cleanBack.length <= maxLen) {
        cleanFront = cleanBack + ' ...'
      } else {
        const cut = cleanBack.lastIndexOf(' ', maxLen)
        const end = cut > maxLen * 0.5 ? cut : maxLen
        cleanFront = cleanBack.slice(0, end) + ' ...'
      }
    }
    return { ...c, front: cleanFront, back: cleanBack }
  })
  if (changed) storageService.setFlashcards(updated)
  return updated
}

interface FlashcardState {
  cards: Flashcard[]
  isLoaded: boolean

  loadCards: () => void
  generateCardsFromAnnotations: (annotations: Annotation[], getDocTitle: (docId: string) => string | undefined) => void
  reviewCard: (cardId: string, grade: number) => void
  removeCard: (cardId: string) => void
  skipCard: (cardId: string) => void
  markSourceDeleted: (annotationId: string) => void
  unmarkSourceDeleted: (annotationId: string) => void
  getDueCards: () => Flashcard[]
}

export const useFlashcardStore = create<FlashcardState>((set, get) => ({
  cards: [],
  isLoaded: false,

  loadCards: () => {
    const cards = storageService.getFlashcards() as Flashcard[]
    set({ cards: migrateCards(cards), isLoaded: true })
  },

  generateCardsFromAnnotations: (annotations, getDocTitle) => {
    const existing = get().cards
    const existingAnnotationIds = new Set(existing.map(c => c.annotationId))

    const newCards: Flashcard[] = []
    for (const annotation of annotations) {
      if (existingAnnotationIds.has(annotation.id)) continue
      const title = getDocTitle(annotation.documentId)
      if (!title) continue
      newCards.push(createCardFromAnnotation(annotation, title))
    }

    if (newCards.length > 0) {
      const updated = [...existing, ...newCards]
      storageService.setFlashcards(updated)
      set({ cards: updated })
    }
  },

  reviewCard: (cardId, grade) => {
    const updated = get().cards.map(c =>
      c.id === cardId ? sm2ReviewCard(c, grade) : c
    )
    storageService.setFlashcards(updated)
    set({ cards: updated })
  },

  removeCard: (cardId) => {
    const updated = get().cards.filter(c => c.id !== cardId)
    storageService.setFlashcards(updated)
    set({ cards: updated })
  },

  skipCard: (cardId) => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000
    const updated = get().cards.map(c =>
      c.id === cardId ? { ...c, nextReview: tomorrow } : c
    )
    storageService.setFlashcards(updated)
    set({ cards: updated })
  },

  getDueCards: () => {
    return getDueCards(get().cards)
  },

  markSourceDeleted: (annotationId) => {
    const updated = get().cards.map(c =>
      c.annotationId === annotationId && !c.sourceDeleted
        ? { ...c, sourceDeleted: true as const }
        : c
    )
    storageService.setFlashcards(updated)
    set({ cards: updated })
  },

  unmarkSourceDeleted: (annotationId) => {
    const updated = get().cards.map(c =>
      c.annotationId === annotationId && c.sourceDeleted
        ? { ...c, sourceDeleted: undefined }
        : c
    )
    storageService.setFlashcards(updated)
    set({ cards: updated })
  },
}))
