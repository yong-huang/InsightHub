import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, BookOpen, FileText,
  Sparkles, Plus, X, Maximize, RefreshCw, Loader2,
  ChevronDown, Highlighter, BrainCircuit, Bookmark,
  MessageCircle, Lightbulb, Languages, Presentation,
  ShieldCheck,
} from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { useQuizStore } from '@/stores/quizStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { getCategoryInfo } from '@/utils/categoryMap'
import { useDocumentUrl } from '@/hooks/useDocumentUrl'
import { useAnnotationIframe } from '@/hooks/useAnnotationIframe'
import { AnnotationPopup } from '@/components/DocReader/AnnotationPopup'
import { generateDocumentSummary, evaluateDocumentAccuracy } from '@/services/aiService'
import { storageService } from '@/services/storageService'
import { fetchImportedDocHtml } from '@/services/importService'
import type { Source } from '@/types'

const SOURCE_SHORT: Record<Source, string> = {
  mindinsight: 'Mind',
  techinsight: 'Tech',
  leetcodeinsight: 'LC',
}
import { AnnotationBar } from '@/components/DocReader/AnnotationBar'
import { CommentDialog } from '@/components/DocReader/CommentDialog'
import { AnnotationPanel } from '@/components/DocReader/AnnotationPanel'
import { SummaryPanel } from '@/components/DocReader/SummaryPanel'
import { EvaluationPanel } from '@/components/DocReader/EvaluationPanel'
import { ChatPanel } from '@/components/DocReader/ChatPanel'
import { AIBubble } from '@/components/DocReader/AIBubble'
import { explainConcept, translateText } from '@/services/readerAiService'
import { buildTitleLookup, findBacklinks } from '@/utils/bidirectionalLinks'
import { extractConcepts, createConceptCard } from '@/services/conceptService'
import { useConceptCardStore } from '@/stores/conceptCardStore'

export function DocReaderPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const fromPath = (location.state as { from?: string; scrollToAnnotation?: string } | null)?.from
  const scrollToAnnotationId = (location.state as { scrollToAnnotation?: string } | null)?.scrollToAnnotation
  const allDocuments = useDocumentStore(s => s.documents)
  const doc = allDocuments.get(docId || '')

  // Redirect orphaned documentIds to their new location
  useEffect(() => {
    if (doc || !docId) return
    // docId not found in current manifest — try fileName matching
    const match = Array.from(allDocuments.values()).find(d =>
      docId.endsWith(d.fileName.replace(/\.html$/, ''))
    )
    if (match) {
      navigate(`/doc/${match.id}`, {
        state: { from: fromPath, scrollToAnnotation: scrollToAnnotationId },
        replace: true,
      })
    }
  }, [docId, doc, allDocuments, navigate, fromPath, scrollToAnnotationId])
  const markAsRead = useDocumentStore(s => s.markAsRead)
  const toggleRead = useDocumentStore(s => s.toggleRead)
  const url = useDocumentUrl(docId || '')

  // Imported document: fetch and create blob URL for iframe
  const [importedBlobUrl, setImportedBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!docId?.startsWith('imported-')) {
      setImportedBlobUrl(null)
      return
    }
    let cancelled = false
    fetchImportedDocHtml(docId)
      .then(htmlContent => {
        if (cancelled) return
        const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' })
        setImportedBlobUrl(URL.createObjectURL(blob))
      })
      .catch(() => {
        if (!cancelled) setImportedBlobUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [docId])

  // Clean up blob URL on unmount or doc change
  useEffect(() => {
    return () => {
      if (importedBlobUrl) URL.revokeObjectURL(importedBlobUrl)
    }
  }, [importedBlobUrl])

  // Use blob URL for imported docs, normal URL otherwise
  const iframeSrc: string | undefined = importedBlobUrl ?? url

  const savedQuizzes = useQuizStore(s => s.savedQuizzes)
  const generatingDocIds = useQuizStore(s => s.generatingDocIds)
  const generatingErrors = useQuizStore(s => s.generatingErrors)
  const startGeneration = useQuizStore(s => s.startGeneration)
  const { quizDifficulty, quizQuestionCount, conceptMaxCount, enablePresentation } = usePreferenceStore()

  const existingQuiz = savedQuizzes[docId || '']
  const isGenerating = !!docId && generatingDocIds.has(docId)
  // Ignore stale errors if quiz already exists (generation succeeded in background)
  const generatingError = (docId && !existingQuiz) ? generatingErrors[docId] : undefined

  // Clean up stale generating error when quiz exists
  useEffect(() => {
    if (docId && existingQuiz && generatingErrors[docId]) {
      useQuizStore.getState().clearGeneration(docId)
    }
  }, [docId, existingQuiz, generatingErrors])

  const [showTagInput, setShowTagInput] = useState(false)
  const [tagName, setTagName] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showRegenerateMenu, setShowRegenerateMenu] = useState(false)
  const [showConceptMenu, setShowConceptMenu] = useState(false)
  const conceptMenuRef = useRef<HTMLDivElement>(null)
  const [showCommentDialog, setShowCommentDialog] = useState(false)
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false)
  const [showSummaryPanel, setShowSummaryPanel] = useState(false)
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [isSummaryGenerating, setIsSummaryGenerating] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [showEvalPanel, setShowEvalPanel] = useState(false)
  const [evalResult, setEvalResult] = useState<string | null>(null)
  const [isEvalGenerating, setIsEvalGenerating] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [showChatPanel, setShowChatPanel] = useState(false)
  const chatHistorySize = docId ? storageService.getChatHistory(docId).length : 0
  const [chatSelectedText, setChatSelectedText] = useState<string | undefined>(undefined)
  const [explainState, setExplainState] = useState<{
    text: string; streamingText: string | null; isStreaming: boolean; error: string | null; rect: DOMRect
  } | null>(null)
  const [translateState, setTranslateState] = useState<{
    text: string; streamingText: string | null; isStreaming: boolean; error: string | null; rect: DOMRect
  } | null>(null)
  const [isBookmarked, setIsBookmarked] = useState(() => docId ? storageService.isReadLater(docId) : false)
  const menuRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Annotation hook
  const allAnnotations = useAnnotationStore(s => s.annotations)
  const docAnnotations = useMemo(
    () => allAnnotations.filter(a => a.documentId === docId),
    [allAnnotations, docId]
  )

  // Bidirectional links
  const titleLookup = useMemo(() => buildTitleLookup(allDocuments), [allDocuments])
  const backlinks = useMemo(
    () => docId ? findBacklinks(docId, allAnnotations, titleLookup) : [],
    [docId, allAnnotations, titleLookup],
  )

  // Concept extraction
  const conceptCards = useConceptCardStore(s => s.cards)
  const conceptAddCards = useConceptCardStore(s => s.addCards)
  const conceptRemoveCard = useConceptCardStore(s => s.removeCard)
  const extractingDocIds = useConceptCardStore(s => s.extractingDocIds)
  const extractingErrors = useConceptCardStore(s => s.extractingErrors)
  const setExtractingDocId = useConceptCardStore(s => s.setExtractingDocId)
  const setExtractingError = useConceptCardStore(s => s.setExtractingError)
  const isExtractingConcepts = !!docId && extractingDocIds.has(docId)
  const docConceptCount = useMemo(
    () => docId ? conceptCards.filter(c => c.sourceDocId === docId).length : 0,
    [docId, conceptCards],
  )
  const {
    selectionInfo,
    staleAnnotationIds,
    activeAnnotationId,
    activeAnnotationRect,
    clearSelection,
    clearActiveAnnotation,
    addHighlight,
    removeHighlight,
    restoreHighlights,
    scrollToAnnotation,
  } = useAnnotationIframe(iframeRef)
  const activeAnnotation = useMemo(
    () => allAnnotations.find(a => a.id === activeAnnotationId) || null,
    [allAnnotations, activeAnnotationId]
  )

  // Close dropdown on outside click
  useEffect(() => {
    if (!showRegenerateMenu && !showConceptMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowRegenerateMenu(false)
      }
      if (conceptMenuRef.current && !conceptMenuRef.current.contains(e.target as Node)) {
        setShowConceptMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showRegenerateMenu, showConceptMenu])

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

  // Reset summary state when document changes, load cached summary
  useEffect(() => {
    setShowSummaryPanel(false)
    setIsSummaryGenerating(false)
    setSummaryError(null)
    setShowEvalPanel(false)
    setIsEvalGenerating(false)
    setEvalError(null)
    setShowChatPanel(false)
    setChatSelectedText(undefined)
    setExplainState(null)
    setTranslateState(null)
    if (docId) {
      const cached = storageService.getSummaries()[docId]
      setSummaryText(cached || null)
      const evalCached = storageService.getSummaries()[`eval-${docId}`]
      setEvalResult(evalCached || null)
      setIsBookmarked(storageService.isReadLater(docId))
    } else {
      setSummaryText(null)
      setEvalResult(null)
      setIsBookmarked(false)
    }
  }, [docId])

  // Save scroll position on scroll (debounced)
  useEffect(() => {
    if (!docId) return
    const onScroll = () => {
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
      scrollSaveTimerRef.current = setTimeout(() => {
        try {
          const doc = iframeRef.current?.contentDocument
          const win = doc?.defaultView
          if (win) {
            storageService.saveReadingPosition(docId, win.scrollY)
          }
        } catch {}
      }, 500)
    }
    try {
      const doc = iframeRef.current?.contentDocument
      const win = doc?.defaultView
      win?.addEventListener('scroll', onScroll, { passive: true })
      return () => {
        win?.removeEventListener('scroll', onScroll)
        if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
      }
    } catch {}
  }, [docId])

  // Save position when leaving the page
  useEffect(() => {
    if (!docId) return
    const save = () => {
      try {
        const doc = iframeRef.current?.contentDocument
        const win = doc?.defaultView
        if (win) storageService.saveReadingPosition(docId, win.scrollY)
      } catch {}
    }
    window.addEventListener('beforeunload', save)
    return () => {
      window.removeEventListener('beforeunload', save)
      save()
    }
  }, [docId])

  const updateAnnotation = useAnnotationStore(s => s.updateAnnotation)

  const toggleReadLater = useCallback(() => {
    if (!docId) return
    if (isBookmarked) {
      storageService.removeFromReadLater(docId)
    } else {
      storageService.addToReadLater(docId)
    }
    setIsBookmarked(!isBookmarked)
    window.dispatchEvent(new Event('storage'))
  }, [docId, isBookmarked])

  const handleUpdateComment = useCallback((annotationId: string, comment: string) => {
    updateAnnotation(annotationId, { comment })
  }, [updateAnnotation])

  const handleAddReply = useCallback((annotationId: string, text: string) => {
    const ann = useAnnotationStore.getState().annotations.find(a => a.id === annotationId)
    if (!ann) return
    const reply = { id: `reply-${Date.now()}`, text, createdAt: Date.now() }
    const replies = [...(ann.replies || []), reply]
    updateAnnotation(annotationId, { replies })
  }, [updateAnnotation])

  const handleGenerateSummary = useCallback(async () => {
    if (!doc) return
    setSummaryText(null)
    setSummaryError(null)
    setIsSummaryGenerating(true)

    const docWithContent = await useDocumentStore.getState().ensureContentText(doc.id)
    const result = await generateDocumentSummary(
      doc.title,
      docWithContent?.contentText || doc.contentText,
      doc.sections,
      (text) => setSummaryText(text),
    )

    setIsSummaryGenerating(false)
    if (!result.success) {
      setSummaryError(result.error || '生成失败')
    } else if (result.data && docId) {
      setSummaryText(result.data)
      storageService.saveSummary(docId, result.data)
    }
  }, [doc, docId])

  const handleEvaluate = useCallback(async () => {
    if (!doc) return
    setEvalResult(null)
    setEvalError(null)
    setIsEvalGenerating(true)

    const docWithContent = await useDocumentStore.getState().ensureContentText(doc.id)
    const result = await evaluateDocumentAccuracy(
      doc.title,
      docWithContent?.contentText || doc.contentText,
      (text) => setEvalResult(text),
    )

    setIsEvalGenerating(false)
    if (!result.success) {
      setEvalError(result.error || '评估失败')
    } else if (result.data && docId) {
      setEvalResult(result.data)
      storageService.saveSummary(`eval-${docId}`, result.data)
    }
  }, [doc, docId])

  const handleRemoveStale = useCallback((ids: string[]) => {
    for (const id of ids) {
      removeHighlight(id, doc?.id || '')
    }
  }, [removeHighlight, doc?.id])

  const handleExtractConcepts = useCallback(async (mode: 'new' | 'regenerate' | 'append') => {
    if (!doc || !docId) return
    setShowConceptMenu(false)
    setExtractingDocId(docId, true)
    setExtractingError(docId, null)

    if (mode === 'regenerate') {
      const existing = useConceptCardStore.getState().cards.filter(c => c.sourceDocId === docId)
      for (const c of existing) {
        useConceptCardStore.getState().removeCard(c.id)
      }
    }

    const remaining = mode === 'append'
      ? conceptMaxCount - useConceptCardStore.getState().cards.filter(c => c.sourceDocId === docId).length
      : conceptMaxCount
    const count = Math.max(1, remaining)

    const docWithContent = await useDocumentStore.getState().ensureContentText(doc.id)
    const result = await extractConcepts(doc.title, docWithContent?.contentText || doc.contentText, count)
    setExtractingDocId(docId, false)
    if (!result.success) {
      setExtractingError(docId, result.error || '提取失败')
    } else if (Array.isArray(result.data)) {
      const cards = (result.data as any[])
        .filter(c => c.conceptName && c.definition)
        .map(c => createConceptCard(c, docId))
      if (cards.length > 0) conceptAddCards(cards)
    }
  }, [doc, docId, conceptMaxCount, conceptAddCards, setExtractingDocId, setExtractingError])

  const handleExplain = useCallback(() => {
    if (!selectionInfo) return
    const rect = selectionInfo.rect
    const selectedText = selectionInfo.text
    // Get surrounding context from the paragraph
    let surroundingText = ''
    try {
      surroundingText = selectionInfo.range.commonAncestorContainer instanceof Text
        ? selectionInfo.range.commonAncestorContainer.parentElement?.closest('p,div,li,td,th')?.textContent || ''
        : (selectionInfo.range.commonAncestorContainer as HTMLElement).closest('p,div,li,td,th')?.textContent || ''
    } catch {}
    clearSelection()
    setExplainState({ text: selectedText, streamingText: '', isStreaming: true, error: null, rect })
    explainConcept(selectedText, surroundingText, (chunk) => {
      setExplainState(prev => prev ? { ...prev, streamingText: chunk } : prev)
    }).then(result => {
      setExplainState(prev => prev ? { ...prev, isStreaming: false, error: result.success ? null : (result.error || '解释失败') } : prev)
    })
  }, [selectionInfo, clearSelection])

  const handleTranslate = useCallback(() => {
    if (!selectionInfo) return
    const rect = selectionInfo.rect
    const selectedText = selectionInfo.text
    clearSelection()
    setTranslateState({ text: selectedText, streamingText: '', isStreaming: true, error: null, rect })
    translateText(selectedText, (chunk) => {
      setTranslateState(prev => prev ? { ...prev, streamingText: chunk } : prev)
    }).then(result => {
      setTranslateState(prev => prev ? { ...prev, isStreaming: false, error: result.success ? null : (result.error || '翻译失败') } : prev)
    })
  }, [selectionInfo, clearSelection])

  const handleAskAI = useCallback(() => {
    if (!selectionInfo) return
    const text = selectionInfo.text
    clearSelection()
    setChatSelectedText(text)
    // Ensure contentText is available for chat context
    if (doc) useDocumentStore.getState().ensureContentText(doc.id)
    setShowChatPanel(true)
  }, [selectionInfo, clearSelection, doc])

  const handleChatSelectionUsed = useCallback(() => {
    setChatSelectedText(undefined)
  }, [])

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

  // Imported doc: show loading while fetching
  if (docId?.startsWith('imported-') && !importedBlobUrl) {
    return (
      <div className="empty-state">
        <Loader2 size={32} className="spin" />
        <h3>正在加载文档...</h3>
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

  // Unassigned tags for the suggestion dropdown
  const availableTags = useMemo(
    () => allTags.filter(t => {
      if (t.documentIds.includes(docId || '')) return false
      // Workspace isolation: only show tags that have documents from the same source
      const prefix = (docId || '').slice(0, 3) // e.g. 'mi-', 'ti-', 'li-'
      return t.documentIds.some(id => id.startsWith(prefix))
    }),
    [allTags, docId]
  )

  const handleGenerate = async (mode: 'new' | 'regenerate' | 'append') => {
    setShowRegenerateMenu(false)
    const docWithContent = await useDocumentStore.getState().ensureContentText(doc.id)
    startGeneration(doc.id, mode, docWithContent || doc, quizDifficulty, quizQuestionCount)
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

  const handleRemoveHighlights = (annotationIds: string[]) => {
    for (const id of annotationIds) {
      removeHighlight(id, doc.id)
    }
    clearSelection()
  }

  return (
    <div className="doc-reader-page">
      <div className="doc-reader-toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(fromPath || `/${doc.source}`)}>
          <ArrowLeft size={18} /> 返回
        </button>

        <div className="doc-reader-toolbar-info">
          <span className={`badge badge-${doc.source}`}>
            {SOURCE_SHORT[doc.source] ?? 'Doc'}
          </span>
          {catInfo && <span className="badge">{catInfo.label}</span>}
          <span className="badge">
            <FileText size={12} />
            {doc.wordCount.toLocaleString()} 字
          </span>
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
              <div className="tag-input-wrap" style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={tagName}
                  onChange={e => setTagName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddTag()
                    if (e.key === 'Escape') { setShowTagInput(false); setTagName('') }
                  }}
                  placeholder="输入或选择标签..."
                  style={{ padding: '4px 8px', fontSize: '0.8rem', width: '140px' }}
                  autoFocus
                />
                {tagName.trim() === '' && availableTags.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 100,
                    background: 'var(--bg-primary)', border: '1px solid var(--border-primary)',
                    borderRadius: 6, maxHeight: 160, overflowY: 'auto',
                    boxShadow: 'var(--shadow-md)', minWidth: 140,
                  }}>
                    {availableTags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => {
                          addDocumentToTag(tag.id, doc.id)
                          setShowTagInput(false)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          width: '100%', padding: '6px 10px', border: 'none',
                          background: 'none', cursor: 'pointer', fontSize: '0.8rem',
                          color: 'var(--text-primary)', textAlign: 'left',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                        {tag.name}
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-dim)' }}>{tag.documentIds.length}</span>
                      </button>
                    ))}
                  </div>
                )}
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

        <div className="doc-reader-toolbar-actions">
          {/* Read status toggle */}
          <button
            className={`btn btn-sm ${doc.isRead ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => doc.isRead ? toggleRead(doc.id) : markAsRead(doc.id)}
            title={doc.isRead ? '点击标记为未读' : '点击标记为已读'}
          >
            <CheckCircle2 size={14} /> {doc.isRead ? '已读' : '未读'}
          </button>

          {/* Annotation panel toggle */}
          <button
            className={`btn btn-sm ${showAnnotationPanel || docAnnotations.length > 0 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowAnnotationPanel(v => !v)}
            title="笔记面板"
          >
            <Highlighter size={14} /> 笔记{docAnnotations.length > 0 && ` ${docAnnotations.length}`}
          </button>

          {/* Chat panel toggle */}
          <button
            className={`btn btn-sm ${showChatPanel || chatHistorySize > 0 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowChatPanel(v => !v)}
            title="AI 问答"
          >
            <MessageCircle size={14} /> 问答
          </button>

          {/* Summary panel toggle */}
          <button
            className={`btn btn-sm ${showSummaryPanel || summaryText ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setShowSummaryPanel(v => {
                if (!v && !summaryText && !isSummaryGenerating && !summaryError) {
                  handleGenerateSummary()
                }
                return !v
              })
            }}
            title="AI 摘要"
          >
            <BrainCircuit size={14} /> 摘要
          </button>

          {/* Evaluation button */}
          {isEvalGenerating ? (
            <span className="btn btn-primary btn-sm" style={{ opacity: 0.7, cursor: 'wait' }}>
              <Loader2 size={14} className="spin" /> 评估
            </span>
          ) : (
            <button
              className={`btn btn-sm ${showEvalPanel || evalResult ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setShowEvalPanel(v => {
                  if (!v && !evalResult && !isEvalGenerating && !evalError) {
                    handleEvaluate()
                  }
                  return !v
                })
              }}
              title="AI 评估"
            >
              <ShieldCheck size={14} /> 评估
            </button>
          )}

          {/* Extract concepts button */}
          {isExtractingConcepts ? (
            <span className="btn btn-secondary btn-sm" style={{ opacity: 0.7, cursor: 'wait' }}>
              <Loader2 size={14} className="spin" /> 概念
            </span>
          ) : docConceptCount > 0 ? (
            <div ref={conceptMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
              <Link
                to={`/spaced-repetition?docId=${doc.id}`}
                className="btn btn-primary btn-sm"
              >
                <Lightbulb size={14} /> 概念 {docConceptCount}
              </Link>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '6px 6px' }}
                onClick={() => setShowConceptMenu(v => !v)}
                title="更多选项"
              >
                <ChevronDown size={12} />
              </button>
              {showConceptMenu && (
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
                    onClick={() => handleExtractConcepts('regenerate')}
                    onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}
                  >
                    重新生成
                  </button>
                  {docConceptCount < conceptMaxCount && (
                    <button
                      className="dropdown-item"
                      style={{
                        display: 'block', width: '100%', padding: '8px 14px',
                        border: 'none', borderTop: '1px solid var(--border-primary)',
                        background: 'none', cursor: 'pointer',
                        textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-primary)',
                      }}
                      onClick={() => handleExtractConcepts('append')}
                      onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}
                    >
                      追加概念
                    </button>
                  )}
                  <button
                    className="dropdown-item"
                    style={{
                      display: 'block', width: '100%', padding: '8px 14px',
                      border: 'none', borderTop: '1px solid var(--border-primary)',
                      background: 'none', cursor: 'pointer',
                      textAlign: 'left', fontSize: '0.85rem', color: '#e74c3c',
                    }}
                    onClick={() => {
                      const ids = conceptCards.filter(c => c.sourceDocId === docId).map(c => c.id)
                      ids.forEach(id => conceptRemoveCard(id))
                      setShowConceptMenu(false)
                    }}
                    onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.target as HTMLElement).style.background = 'none'}
                  >
                    删除全部
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleExtractConcepts('new')}
            >
              <Lightbulb size={14} /> 概念
            </button>
          )}

          {/* Quiz button area */}
          {isGenerating ? (
            <span className="btn btn-primary btn-sm" style={{ opacity: 0.7, cursor: 'wait' }}>
              <Loader2 size={14} className="spin" /> 测试
            </span>
          ) : generatingError ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleGenerate(existingQuiz ? 'regenerate' : 'new')}
              title={generatingError}
            >
              <RefreshCw size={14} /> 重试
            </button>
          ) : existingQuiz ? (
            <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
              <Link
                to={`/quiz/quiz-${doc.id}?docId=${doc.id}&from=${encodeURIComponent(fromPath || `/${doc.source}/${doc.category}`)}`}
                className="btn btn-primary btn-sm"
              >
                <Sparkles size={14} /> 测试 {existingQuiz.questions.length}
              </Link>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '6px 6px' }}
                onClick={() => setShowRegenerateMenu(v => !v)}
                title="更多选项"
              >
                <ChevronDown size={12} />
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
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleGenerate('new')}
            >
              <Sparkles size={14} /> 测试
            </button>
          )}

          {/* Bookmark toggle */}
          <button
            className={`btn btn-sm ${isBookmarked ? 'btn-primary' : 'btn-secondary'}`}
            onClick={toggleReadLater}
            title={isBookmarked ? '取消收藏' : '收藏'}
          >
            <Bookmark size={14} fill={isBookmarked ? 'currentColor' : 'none'} /> 收藏
          </button>

          {/* Present button */}
          {enablePresentation && (
          <Link
            to={`/presentation/${doc.id}`}
            className="btn btn-secondary btn-sm"
            title="演示"
          >
            <Presentation size={14} /> 演示
          </Link>
          )}

          {/* Fullscreen */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={toggleFullscreen}
            title="全屏阅读"
          >
            <Maximize size={16} /> 全屏
          </button>
        </div>
      </div>

      {backlinks.length > 0 && (
      <div className="doc-reader-titlebar">
        <div className="backlinks-panel" style={{ marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
            反向链接({backlinks.length})：
          </span>
          {backlinks.slice(0, 5).map(ann => {
            const srcDoc = allDocuments.get(ann.documentId)
            return (
              <Link
                key={ann.id}
                to={`/doc/${ann.documentId}`}
                className="wiki-link"
                style={{ fontSize: '0.8rem', marginRight: '0.5rem' }}
                title={ann.comment}
              >
                {srcDoc?.title || '文档'}中的引用
              </Link>
            )
          })}
        </div>
      </div>
      )}

      <div className="doc-reader-content">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          className="doc-reader-iframe"
          style={{ background: '#fff', border: 'none', flex: 1 }}
          title={doc.title}
        />

        {showAnnotationPanel && (
          <AnnotationPanel
            annotations={docAnnotations}
            titleLookup={titleLookup}
            onScrollTo={scrollToAnnotation}
            onRemove={handleRemoveAnnotation}
            onUpdateComment={handleUpdateComment}
            onAddReply={handleAddReply}
            staleAnnotationIds={staleAnnotationIds}
            onRemoveStale={handleRemoveStale}
          />
        )}

        {showSummaryPanel && (
          <SummaryPanel
            summaryText={summaryText}
            isGenerating={isSummaryGenerating}
            error={summaryError}
            onGenerate={handleGenerateSummary}
            onClose={() => setShowSummaryPanel(false)}
          />
        )}

        {showEvalPanel && (
          <EvaluationPanel
            resultText={evalResult}
            isGenerating={isEvalGenerating}
            error={evalError}
            onGenerate={handleEvaluate}
            onClose={() => setShowEvalPanel(false)}
          />
        )}

        {showChatPanel && (
          <ChatPanel
            documentId={docId || ''}
            documentTitle={doc.title}
            documentContent={doc.contentText}
            iframeRef={iframeRef}
            selectedText={chatSelectedText}
            onClose={() => { setShowChatPanel(false); setChatSelectedText(undefined) }}
            onSelectionUsed={handleChatSelectionUsed}
          />
        )}
      </div>

      {/* Floating annotation bar */}
      {selectionInfo && (
        <AnnotationBar
          selectionInfo={selectionInfo}
          onHighlight={handleHighlight}
          onComment={() => setShowCommentDialog(true)}
          onExplain={handleExplain}
          onTranslate={handleTranslate}
          onAskAI={handleAskAI}
          onRemoveHighlights={handleRemoveHighlights}
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

      {/* Annotation popup on click — only for comments */}
      {activeAnnotation && activeAnnotationRect && (activeAnnotation.type === 'comment' || activeAnnotation.comment) && (
        <AnnotationPopup
          annotation={activeAnnotation}
          rect={activeAnnotationRect}
          titleLookup={titleLookup}
          onClose={clearActiveAnnotation}
          onRemove={handleRemoveAnnotation}
        />
      )}

      {/* AI Explain bubble */}
      {explainState && (
        <AIBubble
          rect={explainState.rect}
          title="概念解释"
          icon={<Lightbulb size={14} />}
          streamingText={explainState.streamingText}
          isStreaming={explainState.isStreaming}
          error={explainState.error}
          onClose={() => setExplainState(null)}
        />
      )}

      {/* AI Translate bubble */}
      {translateState && (
        <AIBubble
          rect={translateState.rect}
          title="翻译"
          icon={<Languages size={14} />}
          streamingText={translateState.streamingText}
          isStreaming={translateState.isStreaming}
          error={translateState.error}
          onClose={() => setTranslateState(null)}
        />
      )}
    </div>
  )
}
