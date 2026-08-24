import { lazy, Suspense, useMemo, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Maximize, Minimize, Network, User } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useQuizStore } from '@/stores/quizStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { ChartCard } from '@/components/stats/ChartCard'
import type { GraphOptions } from '@/utils/graphBuilder'

const KnowledgeGraph = lazy(() =>
  import('@/components/visualization/KnowledgeGraph').then(m => ({ default: m.KnowledgeGraph }))
)
const PersonalMap = lazy(() =>
  import('@/components/visualization/PersonalMap').then(m => ({ default: m.PersonalMap }))
)

type ActiveTab = 'graph' | 'map'

const TABS: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { key: 'graph', label: 'Knowledge Graph', icon: <Network size={14} /> },
  { key: 'map', label: 'Knowledge Map', icon: <User size={14} /> },
]

export function KnowledgeGraphPage() {
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const tags = useTagStore(s => s.tags)
  const quizHistory = useQuizStore(s => s.quizHistory)
  const annotations = useAnnotationStore(s => s.annotations)

  const [searchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as ActiveTab | null
  const [activeTab, setActiveTab] = useState<ActiveTab>(tabFromUrl === 'map' ? tabFromUrl : 'graph')
  const [showDocuments, setShowDocuments] = useState(true)
  const [showTags, setShowTags] = useState(true)
  const [showSimilarityEdges, setShowSimilarityEdges] = useState(false)
  const [showReadingPatternEdges, setShowReadingPatternEdges] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('viz-fullscreen', isFullscreen)
    document.body.style.overflow = isFullscreen ? 'hidden' : ''
    return () => {
      document.documentElement.classList.remove('viz-fullscreen')
      document.body.style.overflow = ''
    }
  }, [isFullscreen])

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const entering = !isFullscreen
    setIsFullscreen(entering)
    try {
      if (entering) {
        await document.documentElement.requestFullscreen()
      } else if (document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch { /* fullscreen request denied */ }
  }, [isFullscreen])

  // KnowledgeGraph options
  const graphOptions = useMemo((): GraphOptions => ({
    filterSource: activeWorkspace,
    showDocuments,
    annotations,
    showSimilarityEdges,
    showReadingPatternEdges,
  }), [activeWorkspace, showDocuments, annotations, showSimilarityEdges, showReadingPatternEdges])

  // PersonalMap filtered data
  const filteredDocs = useMemo(() => {
    const filtered = new Map<string, typeof documents extends Map<string, infer V> ? V : never>()
    for (const [id, doc] of documents) {
      if (doc.source === activeWorkspace) {
        filtered.set(id, doc)
      }
    }
    return filtered
  }, [documents, activeWorkspace])

  const filteredQuizHistory = useMemo(() => {
    const docIds = new Set(filteredDocs.keys())
    return quizHistory.filter(q => docIds.has(q.documentId))
  }, [quizHistory, filteredDocs])

  const filteredAnnotations = useMemo(() => {
    const docIds = new Set(filteredDocs.keys())
    return annotations.filter(a => docIds.has(a.documentId))
  }, [annotations, filteredDocs])

  const filteredTags = useMemo(() => {
    const docIds = new Set(filteredDocs.keys())
    return tags.map(t => ({
      ...t,
      documentIds: t.documentIds.filter(id => docIds.has(id)),
    })).filter(t => t.documentIds.length > 0)
  }, [tags, filteredDocs])

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        <div className="cs-section-label">KNOWLEDGE GRAPH</div>
        <h1>Knowledge Graph</h1>
        <p className="cs-settings-subtitle">
          {activeTab === 'graph'
            ? 'Visualize the relationship network between documents, categories, and tags'
            : 'Visualize your knowledge mastery based on learning behavior'}
        </p>
      </div>

      {/* Tab buttons */}
      <div className="cs-btn-group" style={{ marginBottom: '1.25rem' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`cs-btn ${activeTab === tab.key ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'graph' ? (
        <ChartCard
          title="Knowledge Relationship Graph"
          extra={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                className={`cs-btn ${showDocuments ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                onClick={() => setShowDocuments(v => !v)}
              >
                Document Nodes
              </button>
              <button
                className={`cs-btn ${showSimilarityEdges ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                onClick={() => setShowSimilarityEdges(v => !v)}
              >
                Similarity
              </button>
              <button
                className={`cs-btn ${showReadingPatternEdges ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                onClick={() => setShowReadingPatternEdges(v => !v)}
              >
                Reading Pattern
              </button>
              <button className="cs-btn cs-btn-secondary" onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              </button>
            </div>
          }
        >
          <Suspense fallback={null}>
            <KnowledgeGraph documents={documents} tags={tags} options={graphOptions} />
          </Suspense>
        </ChartCard>
      ) : (
        <ChartCard
          title="Knowledge Map"
          extra={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                className={`cs-btn ${showDocuments ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                onClick={() => setShowDocuments(v => !v)}
              >
                Document Nodes
              </button>
              <button
                className={`cs-btn ${showTags ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                onClick={() => setShowTags(v => !v)}
              >
                Tag Nodes
              </button>
              <button className="cs-btn cs-btn-secondary" onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              </button>
            </div>
          }
        >
          <Suspense fallback={null}>
            <PersonalMap
              documents={filteredDocs}
              tags={filteredTags}
              quizHistory={filteredQuizHistory}
              annotations={filteredAnnotations}
              showDocuments={showDocuments}
              showTags={showTags}
            />
          </Suspense>
        </ChartCard>
      )}
    </div>
  )
}
