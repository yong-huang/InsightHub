import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Maximize, Minimize } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { ChartCard } from '@/components/stats/ChartCard'
import { KnowledgeGraph } from '@/components/visualization/KnowledgeGraph'
import type { GraphOptions } from '@/utils/graphBuilder'

export function KnowledgeGraphPage() {
  const navigate = useNavigate()
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const tags = useTagStore(s => s.tags)
  const annotations = useAnnotationStore(s => s.annotations)

  const [showDocuments, setShowDocuments] = useState(true)
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

  const currentOptions = useMemo((): GraphOptions => ({
    filterSource: activeWorkspace,
    showDocuments,
    annotations,
  }), [activeWorkspace, showDocuments, annotations])

  return (
    <div className="viz-page">
      <div className="viz-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">知识图谱</h1>
        </div>
        <p className="viz-page-desc">可视化文档、分类和标签之间的关系网络</p>
      </div>

      <ChartCard
        title="知识关系图谱"
        extra={
          <div className="stats-chart-extra" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              style={{ fontSize: '12px', padding: '5px 14px', border: '1px solid var(--border-default)', background: showDocuments ? 'var(--accent-blue)' : 'var(--bg-card)', color: showDocuments ? '#fff' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              onClick={() => setShowDocuments(v => !v)}
            >
              文档节点
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={toggleFullscreen}
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        }
      >
        <KnowledgeGraph documents={documents} tags={tags} options={currentOptions} />
      </ChartCard>
    </div>
  )
}
