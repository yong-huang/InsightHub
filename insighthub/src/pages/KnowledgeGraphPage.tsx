import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Maximize, Minimize, Network, User, TreePine } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useQuizStore } from '@/stores/quizStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { ChartCard } from '@/components/stats/ChartCard'
import { KnowledgeGraph } from '@/components/visualization/KnowledgeGraph'
import { PersonalMap } from '@/components/visualization/PersonalMap'
import { KnowledgeTree } from '@/components/visualization/KnowledgeTree'
import type { GraphOptions } from '@/utils/graphBuilder'

type ActiveTab = 'graph' | 'map' | 'tree'

export function KnowledgeGraphPage() {
  const navigate = useNavigate()
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const tags = useTagStore(s => s.tags)
  const quizHistory = useQuizStore(s => s.quizHistory)
  const annotations = useAnnotationStore(s => s.annotations)

  const [searchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as ActiveTab | null
  const [activeTab, setActiveTab] = useState<ActiveTab>(tabFromUrl === 'map' || tabFromUrl === 'tree' ? tabFromUrl : 'graph')
  const [showDocuments, setShowDocuments] = useState(true)
  const [showTags, setShowTags] = useState(true)
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
    } catch {}
  }, [isFullscreen])

  // KnowledgeGraph options
  const graphOptions = useMemo((): GraphOptions => ({
    filterSource: activeWorkspace,
    showDocuments,
    annotations,
  }), [activeWorkspace, showDocuments, annotations])

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
    <div className="viz-page">
      <div className="viz-page-header">
        <div className="page-header-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="Back">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">Knowledge Graph</h1>
        </div>
        <div className="viz-tab-bar">
          <button
            className={`viz-tab ${activeTab === 'graph' ? 'active' : ''}`}
            onClick={() => { setActiveTab('graph'); navigate('/knowledge-graph', { replace: true }) }}
          >
            <Network size={15} />
            Knowledge Graph
          </button>
          <button
            className={`viz-tab ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => { setActiveTab('map'); navigate('/knowledge-graph?tab=map', { replace: true }) }}
          >
            <User size={15} />
            Knowledge Map
          </button>
          <button
            className={`viz-tab ${activeTab === 'tree' ? 'active' : ''}`}
            onClick={() => { setActiveTab('tree'); navigate('/knowledge-graph?tab=tree', { replace: true }) }}
          >
            <TreePine size={15} />
            Knowledge Tree
          </button>
        </div>
        <p className="viz-page-desc">
          {activeTab === 'graph'
            ? 'Visualize the relationship network between documents, categories, and tags'
            : activeTab === 'map'
            ? 'Visualize your knowledge mastery based on learning behavior'
            : 'Browse the hierarchy of categories, documents, and concepts in a tree structure'}
        </p>
      </div>

      {activeTab === 'tree' ? (
        <ChartCard title="Knowledge Tree">
          <KnowledgeTree />
        </ChartCard>
      ) : activeTab === 'graph' ? (
        <ChartCard
          title="Knowledge Relationship Graph"
          extra={
            <div className="stats-chart-extra" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                style={{ fontSize: '12px', padding: '5px 14px', border: '1px solid var(--border-default)', background: showDocuments ? 'var(--accent-blue)' : 'var(--bg-card)', color: showDocuments ? '#fff' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                onClick={() => setShowDocuments(v => !v)}
              >
                Document Nodes
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            </div>
          }
        >
          <KnowledgeGraph documents={documents} tags={tags} options={graphOptions} />
        </ChartCard>
      ) : (
        <ChartCard
          title="Knowledge Map"
          extra={
            <div className="stats-chart-extra" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                style={{ fontSize: '12px', padding: '5px 14px', border: '1px solid var(--border-default)', background: showDocuments ? 'var(--accent-blue)' : 'var(--bg-card)', color: showDocuments ? '#fff' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                onClick={() => setShowDocuments(v => !v)}
              >
                Document Nodes
              </button>
              <button
                style={{ fontSize: '12px', padding: '5px 14px', border: '1px solid var(--border-default)', background: showTags ? 'var(--accent-blue)' : 'var(--bg-card)', color: showTags ? '#fff' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-sans)', marginLeft: '6px' }}
                onClick={() => setShowTags(v => !v)}
              >
                Tag Nodes
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                style={{ marginLeft: '6px' }}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            </div>
          }
        >
          <PersonalMap
            documents={filteredDocs}
            tags={filteredTags}
            quizHistory={filteredQuizHistory}
            annotations={filteredAnnotations}
            showDocuments={showDocuments}
            showTags={showTags}
          />
        </ChartCard>
      )}
    </div>
  )
}
