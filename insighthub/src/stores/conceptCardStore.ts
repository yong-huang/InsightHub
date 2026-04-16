import { create } from 'zustand'
import type { ConceptCard } from '@/types'
import { storageService } from '@/services/storageService'

interface ConceptCardState {
  cards: ConceptCard[]
  isLoaded: boolean
  extractingDocIds: Set<string>
  extractingErrors: Record<string, string>

  loadCards: () => void
  addCards: (newCards: ConceptCard[]) => void
  removeCard: (id: string) => void
  setExtractingDocId: (docId: string, extracting: boolean) => void
  setExtractingError: (docId: string, error: string | null) => void
  reviewCard: (cardId: string, grade: number) => void
  skipCard: (cardId: string) => void
  getDueCards: () => ConceptCard[]
}

function sm2Review(card: ConceptCard, grade: number): ConceptCard {
  let { interval, repetition, efactor } = card

  efactor = efactor + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)
  efactor = Math.max(1.3, efactor)

  if (grade < 3) {
    repetition = 0
    interval = 1
  } else if (repetition === 0) {
    interval = 1
    repetition = 1
  } else if (repetition === 1) {
    interval = 6
    repetition = 2
  } else {
    interval = Math.round(interval * efactor)
    repetition++
  }

  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000

  return {
    ...card,
    interval,
    repetition,
    efactor,
    nextReview: now + interval * DAY_MS,
    lastReview: now,
  }
}

function getDueCards(cards: ConceptCard[]): ConceptCard[] {
  const now = Date.now()
  return cards
    .filter(c => c.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview)
}

function syncCardsToServer(cards: ConceptCard[]): void {
  fetch('/api/concept-cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cards),
  }).catch(() => {})
}

/**
 * Migrate old concept cards that don't have SM-2 fields.
 */
function migrateCards(cards: ConceptCard[]): ConceptCard[] {
  let changed = false
  const updated = cards.map(c => {
    if (c.interval !== undefined) return c
    changed = true
    return {
      ...c,
      interval: 0,
      repetition: 0,
      efactor: 2.5,
      nextReview: 0,
      lastReview: 0,
    }
  })
  if (changed) storageService.setConceptCards(updated)
  return updated
}

export const useConceptCardStore = create<ConceptCardState>((set, get) => ({
  cards: [],
  isLoaded: false,
  extractingDocIds: new Set(),
  extractingErrors: {},

  loadCards: () => {
    const localCards = storageService.getConceptCards() as ConceptCard[]
    const migrated = migrateCards(localCards)
    set({ cards: migrated, isLoaded: true })
    // Merge from server (LAN sync)
    fetch('/api/concept-cards')
      .then(r => r.json())
      .then((serverCards: ConceptCard[]) => {
        const localIds = new Set(migrated.map(c => c.id))
        const merged = [...migrated]
        for (const c of serverCards) {
          if (!localIds.has(c.id)) merged.push(c)
        }
        storageService.setConceptCards(merged)
        set({ cards: merged })
        // Sync merged state back to server
        syncCardsToServer(merged)
      })
      .catch(() => {})
  },

  addCards: (newCards: ConceptCard[]) => {
    const { cards } = get()
    const existingKeys = new Set(
      cards.map(c => `${c.sourceDocId}::${c.conceptName}`)
    )
    const unique = newCards.filter(c => !existingKeys.has(`${c.sourceDocId}::${c.conceptName}`))
    if (unique.length === 0) return

    const updated = [...cards, ...unique]
    set({ cards: updated })
    storageService.setConceptCards(updated)
    syncCardsToServer(updated)
  },

  removeCard: (id: string) => {
    const updated = get().cards.filter(c => c.id !== id)
    set({ cards: updated })
    storageService.setConceptCards(updated)
    syncCardsToServer(updated)
  },

  setExtractingDocId: (docId: string, extracting: boolean) => {
    set(state => {
      const next = new Set(state.extractingDocIds)
      if (extracting) next.add(docId)
      else next.delete(docId)
      return { extractingDocIds: next }
    })
  },

  setExtractingError: (docId: string, error: string | null) => {
    set(state => {
      const next = { ...state.extractingErrors }
      if (error) next[docId] = error
      else delete next[docId]
      return { extractingErrors: next }
    })
  },

  reviewCard: (cardId, grade) => {
    const updated = get().cards.map(c =>
      c.id === cardId ? sm2Review(c, grade) : c
    )
    set({ cards: updated })
    storageService.setConceptCards(updated)
    syncCardsToServer(updated)
  },

  skipCard: (cardId) => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000
    const updated = get().cards.map(c =>
      c.id === cardId ? { ...c, nextReview: tomorrow } : c
    )
    set({ cards: updated })
    storageService.setConceptCards(updated)
    syncCardsToServer(updated)
  },

  getDueCards: () => {
    return getDueCards(get().cards)
  },
}))
