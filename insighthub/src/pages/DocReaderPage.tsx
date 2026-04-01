import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, BookOpen, FileText,
  Sparkles, Plus, X, Maximize, RefreshCw, Loader2,
  ChevronDown, Highlighter,
} from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useQuizStore } from '@/stores/quizStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { getCategoryInfo } from '@/utils/categoryMap'
import { useDocumentUrl } from '@/hooks/useDocumentUrl'
import { useAnnotationIframe } from '@/hooks/useAnnotationIframe'
import { AnnotationBar } from '@/components/DocReader/AnnotationBar'
import { CommentDialog } from '@/components/DocReader/CommentDialog'
import { AnnotationPanel } from '@/components/DocReader/AnnotationPanel'

export function DocReaderPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const fromPath = (location.state as { from?: string; scrollToAnnotation?: string } | null)?.from
  const scrollToAnnotationId = (location.state as { scrollToAnnotation?: string } | null)?.scrollToAnnotation
  const doc = useDocumentStore(s => s.documents.get(docId || ''))
  const markAsRead = useDocumentStore(s => s.markAsRead)
  const toggleRead = useDocumentStore(s => s.toggleRead)
  const url = useDocumentUrl(docId || '')

  const savedQuizzes = useQuizStore(s => s.savedQuizzes)
  const generatingDocId = useQuizStore(s => s.generatingDocId)
  const generatingError = useQuizStore(s => s.generatingError)
  const startGeneration = useQuizStore(s => s.startGeneration)
  const clearGeneration = useQuizStore(s => s.clearGeneration)
  const { quizDifficulty, quizQuestionCount } = usePreferenceStore()

  const existingQuiz = savedQuizzes[docId || '']
  const isGenerating = generatingDocId === docId

  const [showTagInput, setShowTagInput] = useState(false)
  const [tagName, setTagName] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showRegenerateMenu, setShowRegenerateMenu] = useState(false)
  const [showCommentDialog, setShowCommentDialog] = useState(false)
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // Annotation hook
  const allAnnotations = useAnnotationStore(s => s.annotations)
  const docAnnotations = useMemo(
    () => allAnnotations.filter(a => a.documentId === docId),
    [allAnnotations, docId]
  )
  const {
    selectionInfo,
    clearSelection,
    addHighlight,
    removeHighlight,
    restoreHighlights,
    scrollToAnnotation,
  } = useAnnotationIframe(iframeRef)

  // Close dropdown on outside click
  useEffect(() => {
    if (!showRegenerateMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowRegenerateMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRegenerateMenu])

  // CSS class hides navbar/sidebar/toolbar, iframe fills viewport
  useEffect(() => {
    document.documentElement.classList.toggle('doc-fullscreen-active', isFullscreen)
    document.body.style.overflow = isFullscreen ? 'hidden' : ''
    return () => {
      document.documentElement.classList.remove('doc-fullscreen-active')
      document.body.style.overflow = ''
    }
  }, [isFullscreen])

  // If Fullscreen API exits for any reason (Esc, system gesture),
  // sync CSS overlay state to match.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false)
      }
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

  const allTags = useTagStore(s => s.tags)
  const addTag = useTagStore(s => s.addTag)
  const addDocumentToTag = useTagStore(s => s.addDocumentToTag)
  const removeDocumentFromTag = useTagStore(s => s.removeDocumentFromTag)

  const tags = useMemo(
    () => allTags.filter(t => t.documentIds.includes(docId || '')),
    [allTags, docId]
  )

  const catInfo = doc ? getCategoryInfo(doc.category) : null

  // Restore highlights on iframe load and scroll to annotation if requested
  useEffect(() => {
    if (!docId) return
    const restoreAndScroll = () => {
      restoreHighlights(docId)
      if (scrollToAnnotationId) {
        setTimeout(() => scrollToAnnotation(scrollToAnnotationId), 800)
      }
    }
    // Wait a bit for iframe to load
    const timer = setTimeout(restoreAndScroll, 1000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  if (!doc) {
    return (
      <div className="empty-state">
        <BookOpen size={48} />
        <h3>文档未找到</h3>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          返回首页
        </button>
      </div>
    )
  }

  const handleAddTag = () => {
    if (!tagName.trim() || !docId) return
    const existingTag = useTagStore.getState().tags.find(t => t.name === tagName.trim())
    if (existingTag) {
      addDocumentToTag(existingTag.id, doc.id)
    } else {
      addTag(tagName.trim(), doc.id)
    }
    setTagName('')
    setShowTagInput(false)
  }

  const handleGenerate = (mode: 'new' | 'regenerate' | 'append') => {
    setShowRegenerateMenu(false)
    startGeneration(doc.id, mode, doc, quizDifficulty, quizQuestionCount)
  }

  const handleHighlight = (color: string) => {
    addHighlight(doc.id, color)
  }

  const handleComment = (comment: string, color: string) => {
    addHighlight(doc.id, color, comment)
    setShowCommentDialog(false)
  }

  const handleRemoveAnnotation = (annotationId: string) => {
    removeHighlight(annotationId, doc.id)
  }

  return (
    <div className="doc-reader-page">
      <div className="doc-reader-toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(fromPath || `/${doc.source}`)}>
          <ArrowLeft size={16} /> 返回
        </button>

        <div className="doc-reader-toolbar-info">
          <span className={`badge badge-${doc.source}`}>
            {doc.source === 'mindinsight' ? 'Mind' : 'Tech'}
          </span>
          {catInfo && <span className="badge">{catInfo.label}</span>}
          <span className="badge">
            <FileText size={12} />
            {doc.wordCount.toLocaleString()} 字
          </span>
        </div>

        <div className="doc-reader-toolbar-actions">
          {doc.isRead ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => toggleRead(doc.id)}
            >
              <CheckCircle2 size={14} /> 取消已读
            </button>
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => markAsRead(doc.id)}
            >
              <CheckCircle2 size={14} /> 标记已读
            </button>
          )}

          {/* Annotation panel toggle */}
          <button
            className={`btn btn-sm ${showAnnotationPanel ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowAnnotationPanel(v => !v)}
            title="笔记面板"
          >
            <Highlighter size={14} />
            {docAnnotations.length > 0 && (
              <span style={{ fontSize: '0.7rem' }}>{docAnnotations.length}</span>
            )}
          </button>

          {/* Quiz button area */}
          {isGenerating ? (
            <span className="btn btn-primary btn-sm" style={{ opacity: 0.7, cursor: 'wait' }}>
              <Loader2 size={14} className="spin" /> 生成中...
            </span>
          ) : generatingError ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={generatingError}>
                {generatingError}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleGenerate(existingQuiz ? 'regenerate' : 'new')}
              >
                <RefreshCw size={14} /> 重试
              </button>
            </div>
          ) : existingQuiz ? (
            <div className="quiz-toolbar-group" ref={menuRef} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
              <span className="badge" style={{ fontSize: '0.75rem' }}>
                {existingQuiz.questions.length} 道题
              </span>
              <Link
                to={`/quiz/quiz-${doc.id}?docId=${doc.id}&from=${encodeURIComponent(fromPath || `/${doc.source}/${doc.category}`)}`}
                className="btn btn-primary btn-sm"
              >
                <Sparkles size={14} /> 开始测验
              </Link>
              <div style={{ position: 'relative' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowRegenerateMenu(v => !v)}
                >
                  <RefreshCw size={14} /> <ChevronDown size={12} />
                </button>
                {showRegenerateMenu && (
                  <div className="dropdown-menu" onMouseDown={e => e.stopPropagation()} style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                    background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                    borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 100,
                    minWidth: 140, overflow: 'hidden',
                  }}>
                    <button
                      className="dropdown-item"
                      style={{
                        display: 'block', width: '100%', padding: '8px 14px',
                        border: 'none', background: 'none', cursor: 'pointer',
                        textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-primary)',
                      }}
                      onClick={() => handleGenerate('regenerate')}
                      onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}
                    >
                      重新生成
                    </button>
                    <button
                      className="dropdown-item"
                      style={{
                        display: 'block', width: '100%', padding: '8px 14px',
                        border: 'none', borderTop: '1px solid var(--border-primary)',
                        background: 'none', cursor: 'pointer',
                        textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-primary)',
                      }}
                      onClick={() => handleGenerate('append')}
                      onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}
                    >
                      追加题目
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleGenerate('new')}
            >
              <Sparkles size={14} /> 生成测验
            </button>
          )}

          <button
            className="btn btn-ghost btn-sm"
            onClick={toggleFullscreen}
            title="全屏阅读"
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>

      <div className="doc-reader-titlebar">
        <h1>{doc.title}</h1>

        <div style={{ marginTop: '0.5rem' }}>
          <div className="tag-list">
            {tags.map(tag => (
              <span
                key={tag.id}
                className="tag-pill"
                style={{ background: `${tag.color}20`, color: tag.color }}
              >
                {tag.name}
                <button
                  onClick={(e) => { e.stopPropagation(); removeDocumentFromTag(tag.id, doc.id) }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, border: 'none', borderRadius: '50%', background: 'rgba(0,0,0,0.15)', color: 'inherit', cursor: 'pointer', fontSize: '0.6rem', lineHeight: 1, padding: 0 }}
                >
                  <X size={8} />
                </button>
              </span>
            ))}
            {!showTagInput ? (
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                onClick={() => setShowTagInput(true)}
              >
                <Plus size={12} /> 标签
              </button>
            ) : (
              <div className="tag-input-wrap">
                <input
                  type="text"
                  value={tagName}
                  onChange={e => setTagName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                  placeholder="标签名..."
                  style={{ padding: '4px 8px', fontSize: '0.8rem', width: '120px' }}
                  autoFocus
                />
                <button className="btn btn-ghost btn-sm" onClick={handleAddTag}>
                  <Plus size={12} />
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowTagInput(false); setTagName('') }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="doc-reader-content" style={{ display: 'flex', gap: 0, flex: 1 }}>
        <iframe
          ref={iframeRef}
          src={url}
          className="doc-reader-iframe"
          style={{ background: '#fff', border: 'none', flex: 1 }}
          title={doc.title}
        />

        {!isFullscreen && showAnnotationPanel && (
          <AnnotationPanel
            annotations={docAnnotations}
            onScrollTo={scrollToAnnotation}
            onRemove={handleRemoveAnnotation}
          />
        )}
      </div>

      {/* Floating annotation bar */}
      {selectionInfo && (
        <AnnotationBar
          selectionInfo={selectionInfo}
          onHighlight={handleHighlight}
          onComment={() => setShowCommentDialog(true)}
          onClose={clearSelection}
        />
      )}

      {/* Comment dialog */}
      {showCommentDialog && selectionInfo && (
        <CommentDialog
          selectedText={selectionInfo.text}
          onSave={handleComment}
          onCancel={() => {
            setShowCommentDialog(false)
            clearSelection()
          }}
        />
      )}
    </div>
  )
}
