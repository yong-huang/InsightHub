import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Maximize, Minimize } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useQuizStore } from '@/stores/quizStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { ChartCard } from '@/components/stats/ChartCard'
import { PersonalMap } from '@/components/visualization/PersonalMap'

export function PersonalMapPage() {
  const navigate = useNavigate()
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const tags = useTagStore(s => s.tags)
  const quizHistory = useQuizStore(s => s.quizHistory)
  const annotations = useAnnotationStore(s => s.annotations)

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

  // Filter by active workspace
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">知识地图</h1>
        </div>
        <p className="viz-page-desc">基于你的学习行为，可视化知识掌握程度</p>
      </div>

      <ChartCard
        title="知识地图"
        extra={
          <div className="stats-chart-extra" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              style={{ fontSize: '12px', padding: '5px 14px', border: '1px solid var(--border-default)', background: showDocuments ? 'var(--accent-blue)' : 'var(--bg-card)', color: showDocuments ? '#fff' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              onClick={() => setShowDocuments(v => !v)}
            >
              文档节点
            </button>
            <button
              style={{ fontSize: '12px', padding: '5px 14px', border: '1px solid var(--border-default)', background: showTags ? 'var(--accent-blue)' : 'var(--bg-card)', color: showTags ? '#fff' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-sans)', marginLeft: '6px' }}
              onClick={() => setShowTags(v => !v)}
            >
              标签节点
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={toggleFullscreen}
              title={isFullscreen ? '退出全屏' : '全屏'}
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
    </div>
  )
}
