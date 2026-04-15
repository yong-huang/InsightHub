import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, FileText, MessageSquare, Highlighter, BookOpen, Download } from 'lucide-react'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { WikiLinkRenderer } from '@/components/DocReader/WikiLinkRenderer'
import { buildTitleLookup } from '@/utils/bidirectionalLinks'
import { exportNotesAsMarkdown } from '@/utils/notesExporter'
import type { Annotation } from '@/types'

type NoteFilter = 'all' | 'highlight' | 'comment'

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface DocGroup {
  documentId: string
  title: string | null
  source: string | undefined
  annotations: Annotation[]
}

export function NotesPage() {
  const navigate = useNavigate()
  const annotations = useAnnotationStore(s => s.annotations)
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const titleLookup = useMemo(() => buildTitleLookup(documents), [documents])

  // Extract a readable title from documentId when the document is missing
  const getDocTitle = (docId: string) => {
    const doc = documents.get(docId)
    if (doc) return doc.title
    // Fallback: e.g. "ti-job-storage-interview-preparation" → "Job / Storage Interview Preparation"
    const wsPrefix = docId.startsWith('mi-') ? 3 : docId.startsWith('ti-') ? 3 : 0
    const rest = docId.slice(wsPrefix)
    return rest.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const isWorkspaceMatch = (docId: string) => {
    const doc = documents.get(docId)
    if (doc) return doc.source === activeWorkspace
    // Fallback: use documentId prefix
    const wsPrefix = activeWorkspace === 'mindinsight' ? 'mi-' : 'ti-'
    return docId.startsWith(wsPrefix)
  }

  const filteredAnnotations = useMemo(() => {
    return annotations
      .filter(a => isWorkspaceMatch(a.documentId))
      .filter(a => filter === 'all' || a.type === filter)
      .filter(a => {
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        const doc = documents.get(a.documentId)
        return (
          a.text.toLowerCase().includes(q) ||
          (a.comment && a.comment.toLowerCase().includes(q)) ||
          (doc?.title.toLowerCase().includes(q))
        )
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [annotations, activeWorkspace, filter, searchQuery, documents])

  const docGroups = useMemo((): DocGroup[] => {
    const map = new Map<string, DocGroup>()
    for (const ann of filteredAnnotations) {
      let group = map.get(ann.documentId)
      if (!group) {
        const doc = documents.get(ann.documentId)
        group = {
          documentId: ann.documentId,
          title: getDocTitle(ann.documentId),
          source: doc?.source,
          annotations: [],
        }
        map.set(ann.documentId, group)
      }
      group.annotations.push(ann)
    }
    return Array.from(map.values())
  }, [filteredAnnotations, documents])

  const totalCount = useMemo(() => {
    return annotations.filter(a => isWorkspaceMatch(a.documentId)).length
  }, [annotations, documents, activeWorkspace])

  const highlightCount = useMemo(() => {
    return annotations.filter(a =>
      a.type === 'highlight' && isWorkspaceMatch(a.documentId)
    ).length
  }, [annotations, documents, activeWorkspace])

  const commentCount = useMemo(() => {
    return annotations.filter(a =>
      a.type === 'comment' && isWorkspaceMatch(a.documentId)
    ).length
  }, [annotations, documents, activeWorkspace])

  const tabs: { key: NoteFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: totalCount },
    { key: 'highlight', label: '高亮', count: highlightCount },
    { key: 'comment', label: '批注', count: commentCount },
  ]

  const goToAnnotation = (ann: Annotation) => {
    navigate(`/doc/${ann.documentId}`, {
      state: { from: '/notes', scrollToAnnotation: ann.id },
    })
  }

  return (
    <div className="viz-page page-notes">
      <div className="viz-page-header">
        <div className="page-header-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">所有笔记</h1>
        </div>
        <p className="viz-page-desc">查看、搜索和管理你的所有笔记</p>
      </div>

      {totalCount === 0 ? (
        <div className="empty-state">
          <BookOpen size={48} />
          <h3>暂无笔记</h3>
          <p>在文档中选中文本并添加高亮或批注后，会显示在这里</p>
        </div>
      ) : (
        <>
          <div className="notes-toolbar">
            <div className="viz-period-selector">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  className={filter === tab.key ? 'active' : ''}
                  onClick={() => setFilter(tab.key)}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => exportNotesAsMarkdown({ annotations: filteredAnnotations, getDocTitle })}
              title="导出为 Markdown"
            >
              <Download size={14} /> 导出
            </button>
            <div className="search-page-input-wrap" style={{ flex: '1 1 240px', minWidth: 200 }}>
              <Search size={16} />
              <input
                type="search"
                className="search-page-input"
                placeholder="搜索笔记..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredAnnotations.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem 2rem' }}>
              <Search size={40} />
              <h3>未找到匹配的笔记</h3>
            </div>
          ) : (
            <div className="notes-groups">
              {docGroups.map(group => (
                <div key={group.documentId} className="notes-group">
                  <div
                    className="notes-group-header"
                    onClick={() => navigate(`/doc/${group.documentId}`)}
                  >
                    <FileText size={16} />
                    <span className="notes-group-title">
                      {group.title ?? '文档已删除'}
                    </span>
                    {group.source && (
                      <span className={`badge badge-${group.source}`}>
                        {group.source === 'mindinsight' ? 'Mind' : 'Tech'}
                      </span>
                    )}
                    <span className="notes-group-count">{group.annotations.length} 条笔记</span>
                  </div>
                  <div className="notes-group-items">
                    {group.annotations.map(ann => (
                      <div
                        key={ann.id}
                        className={`notes-item ${ann.type}`}
                        style={{
                          borderLeftColor: ann.color,
                          backgroundColor: ann.color + '15',
                        }}
                        onClick={() => goToAnnotation(ann)}
                      >
                        <div className="notes-item-text">{ann.text}</div>
                        {ann.type === 'comment' && ann.comment && (
                          <div className="notes-item-comment">
                            <MessageSquare size={12} />
                            <WikiLinkRenderer text={ann.comment} titleLookup={titleLookup} />
                          </div>
                        )}
                        <div className="notes-item-meta">
                          <span className="notes-item-type">
                            {ann.type === 'highlight' ? (
                              <><Highlighter size={12} /> 高亮</>
                            ) : (
                              <><MessageSquare size={12} /> 批注</>
                            )}
                          </span>
                          <span className="notes-item-time">{formatTime(ann.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
