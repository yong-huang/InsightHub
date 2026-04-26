import type { Document, Tag, QuizAttempt, Annotation } from '@/types'
import { type GraphNode, type GraphLink, type GraphData } from './graphBuilder'
import { getCategoryInfo } from '@/utils/categoryMap'

export interface EngagementMetrics {
  readCount: number
  annotationCount: number
  quizAttempts: number
  bestQuizScore: number  // 0-100, -1 = not quizzed
  lastActivityAt: number
}

export interface PersonalMapOptions {
  maxDocumentNodes?: number  // default 50
  showDocuments?: boolean    // default true
  showTags?: boolean         // default true
}

function getMasteryColor(score: number): string {
  if (score >= 80) return '#4ecdc4'  // green - master
  if (score >= 60) return '#fbbf24'  // yellow - good
  if (score >= 40) return '#ff8c42'  // orange - learning
  return '#ff6b6b'                   // red - needs work
}

function getEngagementScore(m: EngagementMetrics): number {
  return m.readCount * 1 + m.annotationCount * 2 + m.quizAttempts * 3
}

function buildDocMetrics(
  documents: Map<string, Document>,
  annotations: Annotation[],
  quizHistory: QuizAttempt[],
): Map<string, EngagementMetrics> {
  const metrics = new Map<string, EngagementMetrics>()

  for (const [docId, doc] of documents) {
    const annCount = annotations.filter(a => a.documentId === docId).length
    const docQuizzes = quizHistory.filter(q => q.documentId === docId)
    const bestScore = docQuizzes.length > 0
      ? Math.round(Math.max(...docQuizzes.map(q => q.maxScore > 0 ? (q.totalScore / q.maxScore) * 100 : -1)))
      : -1

    const activityTimes = [
      doc.lastReadAt || 0,
      ...annotations.filter(a => a.documentId === docId).map(a => a.createdAt),
      ...docQuizzes.map(q => q.completedAt),
    ].filter(t => t > 0)

    metrics.set(docId, {
      readCount: doc.readCount,
      annotationCount: annCount,
      quizAttempts: docQuizzes.length,
      bestQuizScore: bestScore,
      lastActivityAt: activityTimes.length > 0 ? Math.max(...activityTimes) : 0,
    })
  }

  return metrics
}

export function buildPersonalMapData(
  documents: Map<string, Document>,
  tags: Tag[],
  quizHistory: QuizAttempt[],
  annotations: Annotation[],
  options: PersonalMapOptions = {},
): GraphData {
  const {
    maxDocumentNodes = 50,
    showDocuments = true,
    showTags = true,
  } = options

  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const nodeIds = new Set<string>()

  const addNode = (node: GraphNode) => {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id)
      nodes.push(node)
    }
  }

  const addLink = (source: string, target: string, type: string) => {
    if (source !== target) {
      links.push({ source, target, type })
    }
  }

  // Build per-document metrics
  const docMetrics = buildDocMetrics(documents, annotations, quizHistory)

  // Filter to documents with any engagement
  const engagedDocs = Array.from(docMetrics.entries())
    .filter(([, m]) => m.readCount > 0 || m.annotationCount > 0 || m.quizAttempts > 0)
    .sort(([, a], [, b]) => getEngagementScore(b) - getEngagementScore(a))

  if (engagedDocs.length === 0) {
    return { nodes: [], links: [] }
  }

  // Center "me" node
  addNode({
    id: 'user:me',
    type: 'category',
    label: 'Me',
    color: '#6366f1',
    size: 35,
  })

  // Aggregate metrics by category
  const categoryAgg = new Map<string, { metrics: EngagementMetrics; docs: string[] }>()
  for (const [docId, m] of engagedDocs) {
    const doc = documents.get(docId)
    if (!doc) continue
    const cat = doc.category
    if (!categoryAgg.has(cat)) {
      categoryAgg.set(cat, { metrics: { readCount: 0, annotationCount: 0, quizAttempts: 0, bestQuizScore: -1, lastActivityAt: 0 }, docs: [] })
    }
    const agg = categoryAgg.get(cat)!
    agg.docs.push(docId)
    agg.metrics.readCount += m.readCount
    agg.metrics.annotationCount += m.annotationCount
    agg.metrics.quizAttempts += m.quizAttempts
    agg.metrics.lastActivityAt = Math.max(agg.metrics.lastActivityAt, m.lastActivityAt)
    // Best score is the average of best scores across docs
    if (m.bestQuizScore >= 0) {
      if (agg.metrics.bestQuizScore < 0) agg.metrics.bestQuizScore = 0
      agg.metrics.bestQuizScore += m.bestQuizScore
    }
  }

  // Compute average best score per category, penalized by quiz coverage
  for (const agg of categoryAgg.values()) {
    const quizzedCount = agg.docs.filter(d => docMetrics.get(d)!.bestQuizScore >= 0).length
    if (quizzedCount > 0) {
      const avgScore = agg.metrics.bestQuizScore / quizzedCount
      const coverage = quizzedCount / agg.docs.length
      agg.metrics.bestQuizScore = Math.round(avgScore * coverage)
    } else {
      agg.metrics.bestQuizScore = -1
    }
  }

  // Create category nodes sorted by engagement
  const sortedCats = Array.from(categoryAgg.entries())
    .sort(([, a], [, b]) => getEngagementScore(b.metrics) - getEngagementScore(a.metrics))

  for (const [catKey, { metrics, docs }] of sortedCats) {
    const eng = getEngagementScore(metrics)
    const size = Math.max(14, Math.min(28, 10 + eng * 0.5))
    const color = metrics.bestQuizScore >= 0 ? getMasteryColor(metrics.bestQuizScore) : '#a78bfa'

    const catInfo = getCategoryInfo(catKey)
    addNode({
      id: `cat:${catKey}`,
      type: 'category',
      label: catInfo.label,
      color,
      size,
      data: { categoryKey: catKey, categorySource: catInfo.source },
    })
    addLink('user:me', `cat:${catKey}`, 'engaged')
  }

  // Document nodes
  if (showDocuments) {
    const docSlice = engagedDocs.slice(0, maxDocumentNodes)
    for (const [docId, m] of docSlice) {
      const doc = documents.get(docId)
      if (!doc) continue
      const eng = getEngagementScore(m)
      const size = Math.max(4, Math.min(14, 4 + eng * 0.3))
      const color = m.bestQuizScore >= 0 ? getMasteryColor(m.bestQuizScore) : '#a78bfa'
      const label = doc.title.length > 20 ? doc.title.slice(0, 20) + '...' : doc.title

      addNode({
        id: `doc:${docId}`,
        type: 'document',
        label,
        color,
        size,
        data: { docId },
      })
      addLink(`cat:${doc.category}`, `doc:${docId}`, 'belongs')
    }
  }

  // Tag nodes (from engaged docs only)
  if (showTags) {
    const engagedDocIds = new Set(engagedDocs.map(([id]) => id))
    const relevantTags = tags.filter(t => t.documentIds.some(id => engagedDocIds.has(id)))

    for (const tag of relevantTags) {
      const tagDocIds = tag.documentIds.filter(id => engagedDocIds.has(id))
      addNode({
        id: `tag:${tag.id}`,
        type: 'tag',
        label: tag.name,
        color: tag.color,
        size: Math.max(6, Math.min(16, 6 + tagDocIds.length * 2)),
        data: { tagId: tag.id },
      })
      // Connect tag to category nodes of its documents
      for (const docId of tagDocIds) {
        const doc = documents.get(docId)
        if (doc && nodeIds.has(`cat:${doc.category}`)) {
          addLink(`tag:${tag.id}`, `cat:${doc.category}`, 'tagged')
        }
      }
    }
  }

  return { nodes, links }
}
