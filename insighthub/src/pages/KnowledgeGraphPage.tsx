import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { ChartCard } from '@/components/stats/ChartCard'
import { KnowledgeGraph } from '@/components/visualization/KnowledgeGraph'
import type { GraphOptions } from '@/utils/graphBuilder'

export function KnowledgeGraphPage() {
  const navigate = useNavigate()
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const tags = useTagStore(s => s.tags)

  const [showDocuments, setShowDocuments] = useState(true)

  const currentOptions = useMemo((): GraphOptions => ({
    filterSource: activeWorkspace,
    showDocuments,
  }), [activeWorkspace, showDocuments])

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
          <div className="stats-chart-extra">
            <button
              style={{ fontSize: '12px', padding: '5px 14px', border: '1px solid var(--border-default)', background: showDocuments ? 'var(--accent-blue)' : 'var(--bg-card)', color: showDocuments ? '#fff' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              onClick={() => setShowDocuments(v => !v)}
            >
              文档节点
            </button>
          </div>
        }
      >
        <KnowledgeGraph documents={documents} tags={tags} options={currentOptions} />
      </ChartCard>
    </div>
  )
}
