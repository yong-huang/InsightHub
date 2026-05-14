import { create } from 'zustand'
import type { ConceptCard } from '@/types'
import { storageService } from '@/services/storageService'
import { usePreferenceStore } from '@/stores/preferenceStore'

interface ConceptCardState {
  cards: ConceptCard[]
  isLoaded: boolean
  extractingDocIds: Set<string>
  extractingErrors: Record<string, string>

  loadCards: () => void
  addCards: (newCards: ConceptCard[]) => void
  removeCard: (id: string) => Promise<void>
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

function syncCardsToServer(cards: ConceptCard[]): Promise<void> {
  return fetch('/api/concept-cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cards),
  }).then(() => {}).catch(() => {})
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

/** Enforce per-document concept card limit based on current preference */
function enforcePerDocLimit(cards: ConceptCard[]): ConceptCard[] {
  const maxCount = usePreferenceStore.getState().conceptMaxCount || 10
  const docCounts = new Map<string, number>()
  const result: ConceptCard[] = []
  for (const c of cards) {
    const count = docCounts.get(c.sourceDocId) || 0
    if (count < maxCount) {
      result.push(c)
      docCounts.set(c.sourceDocId, count + 1)
    }
  }
  return result
}

export const useConceptCardStore = create<ConceptCardState>((set, get) => ({
  cards: [],
  isLoaded: false,
  extractingDocIds: new Set(),
  extractingErrors: {},

  loadCards: () => {
    const localCards = storageService.getConceptCards() as ConceptCard[]
    const migrated = migrateCards(localCards)
    const enforced = enforcePerDocLimit(migrated)
    set({ cards: enforced, isLoaded: true })
    if (enforced.length !== migrated.length) {
      storageService.setConceptCards(enforced)
      syncCardsToServer(enforced)
    }
    // Merge from server (LAN sync)
    fetch('/api/concept-cards')
      .then(r => r.json())
      .then((serverCards: ConceptCard[]) => {
        const localIds = new Set(enforced.map(c => c.id))
        const merged = [...enforced]
        for (const c of serverCards) {
          if (!localIds.has(c.id)) merged.push(c)
        }
        const trimmed = enforcePerDocLimit(merged)
        storageService.setConceptCards(trimmed)
        set({ cards: trimmed })
        // Sync merged state back to server
        syncCardsToServer(trimmed)
      })
      .catch(() => {})
  },

  addCards: (newCards: ConceptCard[]) => {
    const { cards } = get()
    const maxCount = usePreferenceStore.getState().conceptMaxCount || 10
    const existingKeys = new Set(
      cards.map(c => `${c.sourceDocId}::${c.conceptName}`)
    )
    const unique = newCards.filter(c => !existingKeys.has(`${c.sourceDocId}::${c.conceptName}`))
    if (unique.length === 0) return

    // Enforce per-document limit: count existing cards per doc, only add up to maxCount
    const docCounts = new Map<string, number>()
    for (const c of cards) {
      docCounts.set(c.sourceDocId, (docCounts.get(c.sourceDocId) || 0) + 1)
    }
    const limited = unique.filter(c => {
      const current = docCounts.get(c.sourceDocId) || 0
      if (current < maxCount) {
        docCounts.set(c.sourceDocId, current + 1)
        return true
      }
      return false
    })

    const updated = [...cards, ...limited]
    set({ cards: updated })
    storageService.setConceptCards(updated)
    syncCardsToServer(updated)
  },

  removeCard: async (id: string) => {
    const updated = get().cards.filter(c => c.id !== id)
    set({ cards: updated })
    storageService.setConceptCards(updated)
    await syncCardsToServer(updated)
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
