import { callAIStream, callAI, extractJSON } from './aiService'
import type { AIResponse } from './aiService'
import type { ChallengeRound, ConceptChallenge } from '@/types'

interface ChallengeOptions {
  concept: string
  docContent: string
  roundsSoFar: ChallengeRound[]
}

/** Start a challenge: generate the first challenging question */
export async function startChallenge(
  options: ChallengeOptions,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<AIResponse> {
  const truncatedDoc = options.docContent.slice(0, 4000)

  const messages = [
    {
      role: 'system' as const,
      content: `You are a devil's advocate tutor. Your role is to challenge the user's understanding of the concept: "${options.concept}".

Given the document content below, craft a challenging question, counter-argument, or edge case that tests whether the user truly understands this concept. Be thought-provoking and specific. Use 2-4 sentences.

Reply in plain text, not JSON. Be conversational but intellectually rigorous.`,
    },
    {
      role: 'user' as const,
      content: `Concept: ${options.concept}\n\nDocument content:\n${truncatedDoc}`,
    },
  ]

  return callAIStream(messages, onChunk, signal)
}

/** Evaluate the user's response and return score, feedback, and next challenge */
export async function evaluateResponse(
  concept: string,
  challenge: string,
  userResponse: string,
  docContent: string,
): Promise<{ score: number; feedback: string; nextChallenge?: string }> {
  const truncatedDoc = docContent.slice(0, 3000)

  const messages = [
    {
      role: 'system' as const,
      content: `You are a devil's advocate tutor evaluating a user's response to a conceptual challenge about "${concept}".

Evaluate the response on a 0-100 scale based on:
- Accuracy of the response (30%)
- Depth of understanding shown (30%)
- Ability to address the challenge/counter-argument (25%)
- Clarity of explanation (15%)

Return strict JSON format:
{
  "score": <number 0-100>,
  "feedback": "<constructive feedback, 2-3 sentences explaining what was good and what could be improved>",
  "nextChallenge": "<a follow-up challenging question probing deeper, or a new edge case, 2-3 sentences. Can be null if no good follow-up.>"
}

Be fair but rigorous. A score of 80+ means excellent understanding. 50-79 shows partial understanding. Below 50 means significant gaps.`,
    },
    {
      role: 'user' as const,
      content: `Concept: ${concept}\nChallenge: ${challenge}\nUser response: ${userResponse}\n\nDocument reference:\n${truncatedDoc}`,
    },
  ]

  const result = await callAI(messages, 60000)
  if (!result.success || !result.data) {
    return { score: 0, feedback: 'Failed to evaluate response. Please try again.' }
  }

  try {
    const parsed = extractJSON(String(result.data)) as Record<string, unknown>
    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      feedback: String(parsed.feedback || 'No feedback available.'),
      nextChallenge: parsed.nextChallenge ? String(parsed.nextChallenge) : undefined,
    }
  } catch {
    return { score: 0, feedback: 'Failed to parse evaluation result.' }
  }
}

/** Generate next challenge question */
export async function generateNextChallenge(
  concept: string,
  rounds: ChallengeRound[],
  docContent: string,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<AIResponse> {
  const truncatedDoc = docContent.slice(0, 3000)

  const previousChallenges = rounds.map((r, i) =>
    `Round ${i + 1} Challenge: ${r.challenge}\nRound ${i + 1} Score: ${r.score}/100`
  ).join('\n')

  const messages = [
    {
      role: 'system' as const,
      content: `You are a devil's advocate tutor. The user is being challenged on the concept: "${concept}".

They have already completed ${rounds.length} round(s). Previous challenges:
${previousChallenges}

Based on their performance, craft a NEW challenging question that:
- Explores a different angle or edge case not yet covered
- If they scored low previously, probes the same area more deeply
- If they scored high, increases difficulty with more nuanced scenarios
- Is specific, 2-4 sentences, conversational but rigorous

Reply in plain text, not JSON.`,
    },
    {
      role: 'user' as const,
      content: `Concept: ${concept}\nDocument reference:\n${truncatedDoc}`,
    },
  ]

  return callAIStream(messages, onChunk, signal)
}

/** Create a new ConceptChallenge object */
export function createChallenge(
  documentId: string,
  concept: string,
): ConceptChallenge {
  return {
    id: `challenge-${Date.now()}`,
    documentId,
    concept,
    rounds: [],
    totalScore: 0,
    completedAt: null,
    createdAt: Date.now(),
  }
}
