import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FileText,
  CheckCircle2,
  Lightbulb,
  TreePine,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useConceptCardStore } from '@/stores/conceptCardStore'
import { getCategoriesBySource } from '@/utils/categoryMap'
import type { Document } from '@/types'

interface TreeNodeProps {
  label: string
  icon: React.ReactNode
  color: string
  count?: React.ReactNode
  defaultOpen?: boolean
  children?: React.ReactNode
  onClick?: () => void
  tooltip?: string
}

function TreeNode({ label, icon, color, count, defaultOpen = false, children, onClick, tooltip }: TreeNodeProps) {
  const [open, setOpen] = useState(defaultOpen)
  const hasChildren = Boolean(children)
  const toggle = useCallback(() => setOpen(v => !v), [])

  return (
    <div className="kt-group">
      <div className={`kt-node ${onClick ? 'kt-clickable' : ''}`} onClick={onClick ?? (hasChildren ? toggle : undefined)}>
        <span className="kt-toggle" onClick={hasChildren ? toggle : undefined}>
          {hasChildren ? (
            open ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span style={{ width: 14, display: 'inline-block' }} />
          )}
        </span>
        <span className="kt-icon" style={{ color }}>{icon}</span>
        <span className="kt-label" title={tooltip}>{label}</span>
        {count !== undefined && <span className="kt-count">{count}</span>}
      </div>
      {hasChildren && open && <div className="kt-children">{children}</div>}
    </div>
  )
}

export function KnowledgeTree() {
  const navigate = useNavigate()
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const conceptCards = useConceptCardStore(s => s.cards)

  const { tree, conceptsByDoc } = useMemo(() => {
    const categories = getCategoriesBySource(activeWorkspace)

    // Group docs by category
    const docsByCategory = new Map<string, Document[]>()
    for (const doc of documents.values()) {
      if (doc.source !== activeWorkspace) continue
      const list = docsByCategory.get(doc.category) ?? []
      list.push(doc)
      docsByCategory.set(doc.category, list)
    }

    // Group concepts by docId
    const conceptsByDoc = new Map<string, typeof conceptCards>()
    for (const card of conceptCards) {
      const list = conceptsByDoc.get(card.sourceDocId) ?? []
      list.push(card)
      conceptsByDoc.set(card.sourceDocId, list)
    }

    const tree = categories.map(cat => {
      const docs = docsByCategory.get(cat.key) ?? []
      const totalConcepts = docs.reduce((sum, d) => sum + (conceptsByDoc.get(d.id)?.length ?? 0), 0)
      return { cat, docs, totalConcepts }
    }).filter(g => g.docs.length > 0)

    return { tree, conceptsByDoc }
  }, [activeWorkspace, documents, conceptCards])

  const stats = useMemo(() => {
    let totalDocs = 0
    let totalConcepts = 0
    for (const g of tree) {
      totalDocs += g.docs.length
      totalConcepts += g.totalConcepts
    }
    return { totalDocs, totalConcepts }
  }, [tree])

  return (
    <div className="kt-tree">
      <div className="kt-summary">
        <TreePine size={16} />
        <span>{tree.length} 个分类 · {stats.totalDocs} 篇文档 · {stats.totalConcepts} 个概念</span>
      </div>
      {tree.map(({ cat, docs, totalConcepts }) => (
        <TreeNode
          key={cat.key}
          label={cat.label}
          icon={<FolderOpen size={15} />}
          color="var(--accent-blue)"
          count={`${docs.length} 文档 / ${totalConcepts} 概念`}
          defaultOpen={true}
        >
          {docs
            .slice()
            .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
            .map(doc => {
              const concepts = conceptsByDoc.get(doc.id) ?? []
              return (
                <TreeNode
                  key={doc.id}
                  label={doc.title}
                  icon={
                    doc.isRead
                      ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
                      : <FileText size={14} />
                  }
                  color="var(--accent-green)"
                  count={concepts.length > 0 ? concepts.length : undefined}
                  defaultOpen={false}
                  onClick={() => navigate(`/doc/${doc.id}`)}
                >
                  {concepts.map(card => (
                    <TreeNode
                      key={card.id}
                      label={card.conceptName}
                      icon={<Lightbulb size={13} />}
                      color="var(--accent-purple, #8b5cf6)"
                      tooltip={card.definition}
                    />
                  ))}
                </TreeNode>
              )
            })}
        </TreeNode>
      ))}
    </div>
  )
}
