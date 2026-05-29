import { create } from 'zustand'
import type { ConceptCard } from '@/types'
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

/** Debounced server sync — avoids blocking the UI on every grade click */
let syncTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncCardsToServer(useConceptCardStore.getState().cards)
    syncTimer = null
  }, 1000)
}

/** Flush any pending sync (e.g. on page unload) */
export function flushConceptCardPersistence() {
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncCardsToServer(useConceptCardStore.getState().cards)
    syncTimer = null
  }
}

// Flush on page unload to avoid data loss
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushConceptCardPersistence)
}

/**
 * Migrate old concept cards that don't have SM-2 fields.
 */
function migrateCards(cards: ConceptCard[]): ConceptCard[] {
  return cards.map(c => {
    if (c.interval !== undefined) return c
    return {
      ...c,
      interval: 0,
      repetition: 0,
      efactor: 2.5,
      nextReview: 0,
      lastReview: 0,
    }
  })
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
    set({ isLoaded: false })
    // Load from server (primary), fall back to localStorage for offline
    fetch('/api/concept-cards')
      .then(r => r.json())
      .then((serverCards: ConceptCard[]) => {
        const cards = enforcePerDocLimit(migrateCards(serverCards))
        set({ cards, isLoaded: true })
      })
      .catch(() => {
        // Offline fallback: try localStorage
        try {
          const raw = localStorage.getItem('insighthub:concept-cards')
          const localCards = raw ? JSON.parse(raw) : []
          const cards = enforcePerDocLimit(migrateCards(localCards))
          set({ cards, isLoaded: true })
        } catch {
          set({ isLoaded: true })
        }
      })
  },

  addCards: (newCards: ConceptCard[]) => {
    const { cards } = get()
    const maxCount = usePreferenceStore.getState().conceptMaxCount || 10
    const existingKeys = new Set(
      cards.map(c => `${c.sourceDocId}::${c.conceptName}`)
    )
    const unique = newCards.filter(c => !existingKeys.has(`${c.sourceDocId}::${c.conceptName}`))
    if (unique.length === 0) return

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
    syncCardsToServer(updated)
  },

  removeCard: async (id: string) => {
    const updated = get().cards.filter(c => c.id !== id)
    set({ cards: updated })
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
    set(state => ({
      cards: state.cards.map(c =>
        c.id === cardId ? sm2Review(c, grade) : c
      )
    }))
    scheduleSync()
  },

  skipCard: (cardId) => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000
    set(state => ({
      cards: state.cards.map(c =>
        c.id === cardId ? { ...c, nextReview: tomorrow } : c
      )
    }))
    scheduleSync()
  },

  getDueCards: () => {
    return getDueCards(get().cards)
  },
}))
