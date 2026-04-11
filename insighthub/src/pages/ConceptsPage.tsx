import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Lightbulb, Trash2, X, FileText } from 'lucide-react'
import { useConceptCardStore } from '@/stores/conceptCardStore'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import type { ConceptCard } from '@/types'

export function ConceptsPage() {
  const navigate = useNavigate()
  const cards = useConceptCardStore(s => s.cards)
  const removeCard = useConceptCardStore(s => s.removeCard)
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [expandedCard, setExpandedCard] = useState<string | null>(null)

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      // Workspace filter
      const doc = documents.get(card.sourceDocId)
      if (activeWorkspace === 'mindinsight' && doc?.source !== 'mindinsight' && !card.sourceDocId.startsWith('mi-')) return false
      if (activeWorkspace === 'techinsight' && doc?.source !== 'techinsight' && !card.sourceDocId.startsWith('ti-')) return false

      // Source filter
      if (sourceFilter !== 'all') {
        if (doc?.id !== sourceFilter && card.sourceDocId !== sourceFilter) return false
      }

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          card.conceptName.toLowerCase().includes(q) ||
          card.definition.toLowerCase().includes(q) ||
          card.relatedConcepts.some(rc => rc.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [cards, documents, activeWorkspace, sourceFilter, searchQuery])

  // Build source options
  const sourceOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const card of cards) {
      const doc = documents.get(card.sourceDocId)
      if (doc) {
        map.set(card.sourceDocId, doc.title)
      }
    }
    return Array.from(map.entries())
  }, [cards, documents])

  const expanded = expandedCard ? filteredCards.find(c => c.id === expandedCard) : null

  return (
    <div className="viz-page page-concepts">
      <div className="viz-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">概念卡片库</h1>
          <span className="badge" style={{ fontSize: '0.8rem' }}>{filteredCards.length}</span>
        </div>
        <p className="viz-page-desc">浏览 AI 从文档中提取的核心概念</p>
      </div>

      <div className="notes-toolbar" style={{ marginBottom: '1.5rem' }}>
        <div className="search-page-input-wrap" style={{ flex: '1 1 240px', minWidth: 200 }}>
          <Search size={16} />
          <input
            type="search"
            className="search-page-input"
            placeholder="搜索概念..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        {sourceOptions.length > 1 && (
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          >
            <option value="all">所有文档</option>
            {sourceOptions.map(([docId, title]) => (
              <option key={docId} value={docId}>{title.length > 30 ? title.slice(0, 30) + '...' : title}</option>
            ))}
          </select>
        )}
      </div>

      {filteredCards.length === 0 ? (
        <div className="empty-state">
          <Lightbulb size={48} />
          <h3>暂无概念卡片</h3>
          <p>在文档阅读页点击"提取概念"按钮，AI 将自动提取核心概念</p>
        </div>
      ) : expanded ? (
        <ConceptDetail
          card={expanded}
          docTitle={documents.get(expanded.sourceDocId)?.title}
          onClose={() => setExpandedCard(null)}
          onRemove={() => { removeCard(expanded.id); setExpandedCard(null) }}
          onDocClick={() => navigate(`/doc/${expanded.sourceDocId}`)}
        />
      ) : (
        <div className="concept-grid">
          {filteredCards.map(card => (
            <div
              key={card.id}
              className="concept-card"
              onClick={() => setExpandedCard(card.id)}
            >
              <div className="concept-card-name">{card.conceptName}</div>
              <div className="concept-card-definition">
                {card.definition.length > 100 ? card.definition.slice(0, 100) + '...' : card.definition}
              </div>
              <div className="concept-card-footer">
                <span className="concept-card-source">
                  <FileText size={12} />
                  {(() => {
                    const doc = documents.get(card.sourceDocId)
                    const title = doc?.title || '未知文档'
                    return title.length > 20 ? title.slice(0, 20) + '...' : title
                  })()}
                </span>
                {card.relatedConcepts.length > 0 && (
                  <div className="concept-card-tags">
                    {card.relatedConcepts.slice(0, 3).map(rc => (
                      <span key={rc} className="concept-card-tag">{rc}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConceptDetail({
  card, docTitle, onClose, onRemove, onDocClick,
}: {
  card: ConceptCard
  docTitle?: string
  onClose: () => void
  onRemove: () => void
  onDocClick: () => void
}) {
  return (
    <div className="concept-detail">
      <div className="concept-detail-header">
        <h2 className="concept-detail-name">{card.conceptName}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={onRemove} title="删除">
            <Trash2 size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose} title="关闭">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="concept-detail-section">
        <h4>定义</h4>
        <p className="concept-detail-definition">{card.definition}</p>
      </div>

      {card.examples.length > 0 && (
        <div className="concept-detail-section">
          <h4>示例</h4>
          <ul className="concept-detail-examples">
            {card.examples.map((ex, i) => (
              <li key={i}>{ex}</li>
            ))}
          </ul>
        </div>
      )}

      {card.relatedConcepts.length > 0 && (
        <div className="concept-detail-section">
          <h4>相关概念</h4>
          <div className="concept-detail-tags">
            {card.relatedConcepts.map(rc => (
              <span key={rc} className="concept-card-tag">{rc}</span>
            ))}
          </div>
        </div>
      )}

      {card.sourceSection && (
        <div className="concept-detail-section">
          <h4>来源章节</h4>
          <p>{card.sourceSection}</p>
        </div>
      )}

      <div className="concept-detail-section">
        <h4>来源文档</h4>
        <button className="btn btn-secondary btn-sm" onClick={onDocClick}>
          <FileText size={14} /> {docTitle || '未知文档'}
        </button>
      </div>
    </div>
  )
}
