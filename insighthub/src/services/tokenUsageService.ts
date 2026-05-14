import { storageService } from './storageService'
import type { UsageInfo } from './aiService'

export interface TokenUsageEntry {
  id: string
  feature: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimated: boolean
  timestamp: number
  docId?: string
}

const MAX_ENTRIES = 1000

/** Record a single AI usage event */
export function recordUsage(feature: string, usage: UsageInfo, docId?: string): void {
  const entries = storageService.getTokenUsage()
  entries.unshift({
    id: crypto.randomUUID(),
    feature,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    estimated: usage.estimated ?? false,
    timestamp: Date.now(),
    docId,
  })
  storageService._setTokenUsage(entries.slice(0, MAX_ENTRIES))
}

/** Get all token usage entries */
export function getTokenUsage(): TokenUsageEntry[] {
  return storageService.getTokenUsage() as TokenUsageEntry[]
}

/** Clear all token usage data */
export function clearTokenUsage(): void {
  storageService._setTokenUsage([])
}
