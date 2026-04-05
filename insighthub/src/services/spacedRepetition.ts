import type { Annotation, Flashcard } from '@/types'

/**
 * Strip HTML tags and collapse whitespace to get plain text.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Truncate text for fill-in-the-blank style front.
 * Shows first few words + "..." to prompt recall.
 */
function truncateText(text: string): string {
  const maxLen = 20
  if (text.length <= maxLen) return text + ' ...'
  // Cut at word boundary for Latin text; fixed length for CJK
  const cut = text.lastIndexOf(' ', maxLen)
  const end = cut > maxLen * 0.5 ? cut : maxLen
  return text.slice(0, end) + ' ...'
}

/**
 * Create a flashcard from an annotation.
 * New cards have interval=0 and nextReview=0 so they are immediately due.
 */
export function createCardFromAnnotation(
  annotation: Annotation,
  documentTitle: string,
): Flashcard {
  const hasComment = annotation.type === 'comment' && annotation.comment
  const plainText = stripHtml(annotation.text)
  return {
    id: `fc-${annotation.id}`,
    annotationId: annotation.id,
    documentId: annotation.documentId,
    documentTitle,
    front: hasComment
      ? plainText
      : truncateText(plainText),
    back: hasComment
      ? stripHtml(annotation.comment!)
      : plainText,
    color: annotation.color,
    type: annotation.type,
    interval: 0,
    repetition: 0,
    efactor: 2.5,
    nextReview: 0,
    lastReview: 0,
    createdAt: Date.now(),
  }
}

/**
 * Review a card with a grade (0-5) using the SM-2 algorithm.
 * Returns a new card with updated scheduling fields.
 *
 * Grade mapping:
 *  0 = complete blackout
 *  1 = incorrect, but remembered upon seeing answer
 *  2 = incorrect, but answer seemed easy to recall
 *  3 = correct with serious difficulty
 *  4 = correct after hesitation
 *  5 = perfect
 */
export function reviewCard(card: Flashcard, grade: number): Flashcard {
  let { interval, repetition, efactor } = card

  efactor = efactor + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)
  efactor = Math.max(1.3, efactor)

  if (grade < 3) {
    // Failed — restart
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

/**
 * Get cards that are due for review (nextReview <= now).
 * Returns cards sorted by nextReview ascending (oldest first).
 */
export function getDueCards(cards: Flashcard[], now?: number): Flashcard[] {
  const timestamp = now ?? Date.now()
  return cards
    .filter(c => c.nextReview <= timestamp)
    .sort((a, b) => a.nextReview - b.nextReview)
}

export interface CardStats {
  total: number
  due: number
  new: number       // never reviewed (lastReview === 0)
  learning: number  // reviewed but interval < 21 days
  mastered: number  // interval >= 21 days
}

/**
 * Get summary statistics for a set of cards.
 */
export function getCardStats(cards: Flashcard[]): CardStats {
  const now = Date.now()
  let due = 0
  let newCount = 0
  let learning = 0
  let mastered = 0

  for (const c of cards) {
    if (c.nextReview <= now) due++
    if (c.lastReview === 0) {
      newCount++
    } else if (c.interval < 21) {
      learning++
    } else {
      mastered++
    }
  }

  return { total: cards.length, due, new: newCount, learning, mastered }
}
