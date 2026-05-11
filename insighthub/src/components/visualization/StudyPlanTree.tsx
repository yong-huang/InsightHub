import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  FolderOpen,
  FileText,
  CheckCircle2,
  ChevronsUpDown,
  ChevronsDownUp,
  GraduationCap,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { getCategoryInfo } from '@/utils/categoryMap'
import { TreeNode } from './TreeNode'
import { startGeneration, getOngoingGeneration, loadCachedStudyPlan } from '@/services/studyPlanService'
import type { StudyPlanResult } from '@/services/studyPlanService'

/** Cached uppercase labels — avoids repeated .toUpperCase() calls per render */
const upperCache = new Map<string, string>()
function toUpperCached(label: string): string {
  let cached = upperCache.get(label)
  if (cached === undefined) {
    cached = label.toUpperCase()
    upperCache.set(label, cached)
  }
  return cached
}

export function StudyPlanTree() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromPath = '/learning-path'
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)

  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<StudyPlanResult | null>(null)
  const [error, setError] = useState('')
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())

  // Restore state on mount: re-attach to ongoing generation or load cached plan
  useEffect(() => {
    const ongoing = getOngoingGeneration(activeWorkspace)
    if (ongoing) {
      setIsLoading(true)
      setInputText(ongoing.input)
      ongoing.promise
        .then(plan => { setResult(plan) })
        .catch(() => { /* error shown in storage */ })
        .finally(() => { setIsLoading(false) })
      return
    }

    const cached = loadCachedStudyPlan(activeWorkspace)
    if (cached) {
      setResult(cached)
      setInputText(cached.input)
    }
  }, [activeWorkspace])

  const toggleNode = useCallback((id: string) => {
    setOpenNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Group matches by category
  const { tree, allNodeIds } = useMemo(() => {
    if (!result) return { tree: [], allNodeIds: [] as string[] }

    const catMap = new Map<string, { docId: string; reason: string; priority: 'high' | 'medium' | 'low' }[]>()
    for (const m of result.matches) {
      const doc = documents.get(m.docId)
      if (!doc) continue
      const list = catMap.get(doc.category) ?? []
      list.push(m)
      catMap.set(doc.category, list)
    }

    const ids: string[] = []
    const treeData = Array.from(catMap.entries()).map(([catKey, matches]) => {
      ids.push(`cat:${catKey}`)
      for (const m of matches) {
        ids.push(`doc:${m.docId}`)
      }
      return { catKey, matches }
    })

    return { tree: treeData, allNodeIds: ids }
  }, [result, documents])

  // Auto-expand category nodes when result changes
  useEffect(() => {
    if (allNodeIds.length > 0) {
      setOpenNodes(new Set(allNodeIds.filter(id => id.startsWith('cat:'))))
    }
  }, [allNodeIds])

  const isAllExpanded = allNodeIds.length > 0 && allNodeIds.every(id => openNodes.has(id))

  const toggleAll = useCallback(() => {
    if (isAllExpanded) {
      setOpenNodes(new Set())
    } else {
      setOpenNodes(new Set(allNodeIds))
    }
  }, [isAllExpanded, allNodeIds])

  const handleGenerate = async () => {
    const trimmed = inputText.trim()
    if (!trimmed) return

    setIsLoading(true)
    setError('')
    setResult(null)

    try {
      const plan = await startGeneration(trimmed, documents, activeWorkspace)
      setResult(plan)
    } catch (e: any) {
      setError(e.message || 'Failed to generate study plan')
    } finally {
      setIsLoading(false)
    }
  }

  const priorityColor = (p: string) => {
    if (p === 'high') return 'var(--accent-green)'
    if (p === 'medium') return 'var(--accent-blue)'
    return 'var(--text-dim)'
  }

  return (
    <div>
      {/* Input area */}
      <div style={{ marginBottom: '1rem' }}>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="Paste a JD, job description, or learning goal..."
          rows={4}
          style={{
            width: '100%',
            resize: 'vertical',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border, #e2e8f0)',
            background: 'var(--bg-primary, #fff)',
            color: 'var(--text-primary, #1a1a2e)',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          disabled={isLoading}
        />
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="cs-btn cs-btn-primary"
            onClick={handleGenerate}
            disabled={isLoading || !inputText.trim()}
          >
            {isLoading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {isLoading ? 'Generating...' : 'Generate Study Plan'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--accent-red)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Result tree */}
      {result && (
        <div className="kt-tree">
          <div className="kt-summary">
            <GraduationCap size={16} />
            <span>{result.matches.length} documents matched</span>
            <button
              className="navbar-icon-btn"
              onClick={toggleAll}
              title={isAllExpanded ? 'Collapse all' : 'Expand all'}
            >
              {isAllExpanded ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
            </button>
          </div>

          {/* AI summary */}
          {result.summary && (
            <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, borderBottom: '1px solid var(--border)' }}>
              {result.summary}
            </div>
          )}

          {tree.map(({ catKey, matches }) => {
            const catInfo = getCategoryInfo(catKey)
            return (
              <TreeNode
                key={catKey}
                nodeId={`cat:${catKey}`}
                label={toUpperCached(catInfo.label)}
                icon={<FolderOpen size={15} />}
                color="var(--accent-blue)"
                count={`${matches.length} docs`}
                openNodes={openNodes}
                onToggle={toggleNode}
                onClick={() => {
                  toggleNode(`cat:${catKey}`)
                  navigate(`/${activeWorkspace}/${catKey}`, { state: { from: fromPath } })
                }}
              >
                {matches.map(m => {
                  const doc = documents.get(m.docId)
                  if (!doc) return null
                  return (
                    <TreeNode
                      key={m.docId}
                      nodeId={`doc:${m.docId}`}
                      label={doc.title}
                      icon={
                        doc.isRead
                          ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
                          : <FileText size={14} />
                      }
                      color={priorityColor(m.priority)}
                      tooltip={m.reason}
                      openNodes={openNodes}
                      onToggle={toggleNode}
                      onClick={() => {
                        navigate(`/doc/${m.docId}`, { state: { from: fromPath } })
                      }}
                    />
                  )
                })}
              </TreeNode>
            )
          })}
        </div>
      )}
    </div>
  )
}
