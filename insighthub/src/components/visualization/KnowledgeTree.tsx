import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  FolderOpen,
  FileText,
  CheckCircle2,
  Lightbulb,
  TreePine,
  ChevronsUpDown,
  ChevronsDownUp,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useConceptCardStore } from '@/stores/conceptCardStore'
import { useQuizStore } from '@/stores/quizStore'
import { useDynamicCategories } from '@/hooks/useDynamicCategories'
import { TreeNode } from './TreeNode'
import type { Document } from '@/types'

export function KnowledgeTree() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromPath = '/learning-path'
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const isLoading = useDocumentStore(s => s.isLoading)
  const conceptCards = useConceptCardStore(s => s.cards)
  const quizHistory = useQuizStore(s => s.quizHistory)

  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())

  const toggleNode = useCallback((id: string) => {
    setOpenNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Restore scroll position when navigating back from a document
  useEffect(() => {
    const saved = sessionStorage.getItem('kt-scroll')
    if (saved) {
      const timer = setTimeout(() => {
        window.scrollTo(0, Number(saved))
        sessionStorage.removeItem('kt-scroll')
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [location])

  const dynamicCategories = useDynamicCategories(activeWorkspace)

  const { tree, conceptsByDoc, quizCountByDoc, catAndDocIds } = useMemo(() => {
    const allCatAndDocIds: string[] = []
    const docsByCategory = new Map<string, Document[]>()
    for (const doc of documents.values()) {
      if (doc.source !== activeWorkspace) continue
      const list = docsByCategory.get(doc.category) ?? []
      list.push(doc)
      docsByCategory.set(doc.category, list)
    }

    const conceptsByDoc = new Map<string, typeof conceptCards>()
    for (const card of conceptCards) {
      const list = conceptsByDoc.get(card.sourceDocId) ?? []
      list.push(card)
      conceptsByDoc.set(card.sourceDocId, list)
    }

    const quizCountByDoc = new Map<string, number>()
    for (const attempt of quizHistory) {
      quizCountByDoc.set(attempt.documentId, (quizCountByDoc.get(attempt.documentId) ?? 0) + 1)
    }

    const tree = dynamicCategories.map(cat => {
      const docs = docsByCategory.get(cat.key) ?? []
      const totalConcepts = docs.reduce((sum, d) => sum + (conceptsByDoc.get(d.id)?.length ?? 0), 0)
      const totalQuizzes = docs.reduce((sum, d) => sum + (quizCountByDoc.get(d.id) ?? 0), 0)
      allCatAndDocIds.push(`cat:${cat.key}`)
      for (const doc of docs) {
        allCatAndDocIds.push(`doc:${doc.id}`)
      }
      return { cat, docs, totalConcepts, totalQuizzes }
    }).filter(g => g.docs.length > 0)

    return { tree, conceptsByDoc, quizCountByDoc, catAndDocIds: allCatAndDocIds }
  }, [activeWorkspace, documents, conceptCards, quizHistory, dynamicCategories])

  const stats = useMemo(() => {
    let totalDocs = 0
    let totalConcepts = 0
    for (const g of tree) {
      totalDocs += g.docs.length
      totalConcepts += g.totalConcepts
    }
    return { totalDocs, totalConcepts }
  }, [tree])

  // Default-expand category nodes on first load
  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current || tree.length === 0) return
    initializedRef.current = true
    setOpenNodes(new Set(catAndDocIds.filter(id => id.startsWith('cat:'))))
  }, [tree, catAndDocIds])

  const isAllExpanded = catAndDocIds.length > 0 && catAndDocIds.every(id => openNodes.has(id))

  const toggleAll = useCallback(() => {
    if (isAllExpanded) {
      setOpenNodes(new Set())
    } else {
      setOpenNodes(new Set(catAndDocIds))
    }
  }, [isAllExpanded, catAndDocIds])

  if (isLoading || tree.length === 0) return null

  return (
    <div className="kt-tree">
      <div className="kt-summary">
        <TreePine size={16} />
        <span>{tree.length} Categories · {stats.totalDocs} Documents · {stats.totalConcepts} Concepts</span>
        <button
          className="navbar-icon-btn"
          onClick={toggleAll}
          title={isAllExpanded ? 'Collapse all' : 'Expand all'}
        >
          {isAllExpanded ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
        </button>
      </div>
      {tree.map(({ cat, docs, totalConcepts, totalQuizzes }) => {
        const sortedDocs = docs
          .slice()
          .sort((a, b) => a.title.localeCompare(b.title, 'zh'))

        return (
          <TreeNode
            key={cat.key}
            nodeId={`cat:${cat.key}`}
            label={cat.label}
            icon={<FolderOpen size={15} />}
            color="var(--accent-blue)"
            count={`${docs.length} Docs / ${totalConcepts} Concepts / ${totalQuizzes} Quizzes`}
            openNodes={openNodes}
            onToggle={toggleNode}
          >
            {sortedDocs.map(doc => {
              const concepts = conceptsByDoc.get(doc.id) ?? []
              const quizCount = quizCountByDoc.get(doc.id) ?? 0
              const countParts: string[] = []
              if (concepts.length > 0) countParts.push(`${concepts.length} Concepts`)
              if (quizCount > 0) countParts.push(`${quizCount} Quizzes`)
              return (
                <TreeNode
                  key={doc.id}
                  nodeId={`doc:${doc.id}`}
                  label={doc.title}
                  icon={
                    doc.isRead
                      ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
                      : <FileText size={14} />
                  }
                  color="var(--accent-green)"
                  count={countParts.length > 0 ? countParts.join(' / ') : undefined}
                  openNodes={openNodes}
                  onToggle={toggleNode}
                  onClick={() => {
                    sessionStorage.setItem('kt-scroll', String(window.scrollY))
                    navigate(`/doc/${doc.id}`, { state: { from: fromPath } })
                  }}
                >
                  {concepts.map(card => (
                    <TreeNode
                      key={card.id}
                      nodeId={`concept:${card.id}`}
                      label={card.conceptName}
                      icon={<Lightbulb size={13} />}
                      color="var(--accent-purple, #8b5cf6)"
                      tooltip={card.definition}
                      openNodes={openNodes}
                      onToggle={toggleNode}
                    />
                  ))}
                </TreeNode>
              )
            })}
          </TreeNode>
        )
      })}
    </div>
  )
}
