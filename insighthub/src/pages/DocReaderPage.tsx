import { useEffect, useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, BookOpen, FileText,
  Sparkles, Plus, X, Maximize, Minimize, RefreshCw, Loader2,
  Highlighter, BrainCircuit, Bookmark,
  MessageCircle, Lightbulb, Languages, Trash2,
  ShieldCheck, Swords, GitBranch, Layers, TerminalSquare, Mic,
  ArrowRightLeft, PenLine,
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
import { generateDocumentSummary, evaluateDocumentAccuracy, generatePresentationScript } from '@/services/aiService'
import { storageService } from '@/services/storageService'
import { fetchImportedDocHtml } from '@/services/importService'
import { MoveDocumentDialog } from '@/components/Import/MoveDocumentDialog'
import { getShortLabel, getSourceColor, getSourceColorBg } from '@/utils/workspaceUtils'
import type { Source } from '@/types'
import { AnnotationBar } from '@/components/DocReader/AnnotationBar'
import { CommentDialog } from '@/components/DocReader/CommentDialog'
import { RatingDialog } from '@/components/DocReader/RatingDialog'
import { AnnotationPanel } from '@/components/DocReader/AnnotationPanel'
import { SummaryPanel } from '@/components/DocReader/SummaryPanel'
import { EvaluationPanel } from '@/components/DocReader/EvaluationPanel'
import { ChatPanel } from '@/components/DocReader/ChatPanel'
import { ChallengePanel } from '@/components/DocReader/ChallengePanel'

import { SimilarDocsPanel } from '@/components/DocReader/SimilarDocsPanel'
import { InceptionPanel } from '@/components/DocReader/InceptionPanel'
import { ScriptPanel } from '@/components/DocReader/ScriptPanel'
import { QuizPanel } from '@/components/DocReader/QuizPanel'
import { ConceptCardsPanel } from '@/components/DocReader/ConceptCardsPanel'
import { AIBubble } from '@/components/DocReader/AIBubble'
import { CodeEditorPanel } from '@/components/DocReader/CodeEditorPanel'
import { ShadowTypingPanel } from '@/components/DocReader/ShadowTypingPanel'
import { WhiteboardPanel } from '@/components/DocReader/WhiteboardPanel'
import { explainConcept, translateText, generateInception } from '@/services/readerAiService'
import { buildTitleLookup, findBacklinks } from '@/utils/bidirectionalLinks'
import { extractConcepts, createConceptCard } from '@/services/conceptService'
import { useConceptCardStore } from '@/stores/conceptCardStore'

export function DocReaderPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const fromPath = (location.state as { from?: string; scrollToAnnotation?: string } | null)?.from
  const fromState = (location.state as Record<string, any>) || {}
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
        state: fromState,
        replace: true,
      })
    }
  }, [docId, doc, allDocuments, navigate, fromPath, scrollToAnnotationId])
  const markAsRead = useDocumentStore(s => s.markAsRead)
  const toggleRead = useDocumentStore(s => s.toggleRead)
  const updateRating = useDocumentStore(s => s.updateRating)
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
  const { quizDifficulty, quizQuestionCount, conceptMaxCount, quizEnabledTypes, workspaces, enabledFeatures } = usePreferenceStore()

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
  const [showCommentDialog, setShowCommentDialog] = useState(false)
  const [showRatingDialog, setShowRatingDialog] = useState(false)
  const [trashingDoc, setTrashingDoc] = useState(false)
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false)
  const [showSummaryPanel, setShowSummaryPanel] = useState(false)
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [isSummaryGenerating, setIsSummaryGenerating] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [showEvalPanel, setShowEvalPanel] = useState(false)
  const [evalResult, setEvalResult] = useState<string | null>(null)
  const [isEvalGenerating, setIsEvalGenerating] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [summaryPoppedOut, setSummaryPoppedOut] = useState(false)
  const [evalPoppedOut, setEvalPoppedOut] = useState(false)
  const [showSimilarPanel, setShowSimilarPanel] = useState(false)
  const [similarPoppedOut, setSimilarPoppedOut] = useState(false)
  const [showInceptionPanel, setShowInceptionPanel] = useState(false)
  const [inceptionText, setInceptionText] = useState<string | null>(null)
  const [isInceptionGenerating, setIsInceptionGenerating] = useState(false)
  const [inceptionError, setInceptionError] = useState<string | null>(null)
  const [inceptionPoppedOut, setInceptionPoppedOut] = useState(false)
  const [showChatPanel, setShowChatPanel] = useState(false)
  const chatHistorySize = docId ? storageService.getChatHistory(docId).length : 0
  const [chatSelectedText, setChatSelectedText] = useState<string | undefined>(undefined)
  const [showChallengePanel, setShowChallengePanel] = useState(false)
  const [challengeSelectedText, setChallengeSelectedText] = useState<string | undefined>(undefined)
  const [showQuizPanel, setShowQuizPanel] = useState(false)
  const [showConceptPanel, setShowConceptPanel] = useState(false)
  const [showCodeEditor, setShowCodeEditor] = useState(false)
  const [codeEditorText, setCodeEditorText] = useState<string | undefined>(undefined)
  const [showShadowTyping, setShowShadowTyping] = useState(false)
  const [showWhiteboard, setShowWhiteboard] = useState(false)
  const [showScriptPanel, setShowScriptPanel] = useState(false)
  const [scriptText, setScriptText] = useState<string | null>(null)
  const [isScriptGenerating, setIsScriptGenerating] = useState(false)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [scriptPoppedOut, setScriptPoppedOut] = useState(false)
  const [scriptLang, setScriptLang] = useState<'zh' | 'en'>('zh')
  const [scriptDuration, setScriptDuration] = useState(3)
  const [explainState, setExplainState] = useState<{
    text: string; streamingText: string | null; isStreaming: boolean; error: string | null; rect: DOMRect
  } | null>(null)
  const [translateState, setTranslateState] = useState<{
    text: string; streamingText: string | null; isStreaming: boolean; error: string | null; rect: DOMRect
  } | null>(null)
  const [isBookmarked, setIsBookmarked] = useState(() => docId ? storageService.isReadLater(docId) : false)
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

  const wasGenerating = useRef(isGenerating)
  const wasExtracting = useRef(isExtractingConcepts)

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
  } = useAnnotationIframe(iframeRef, docId)
  const activeAnnotation = useMemo(
    () => allAnnotations.find(a => a.id === activeAnnotationId) || null,
    [allAnnotations, activeAnnotationId]
  )

  const [showMoveDialog, setShowMoveDialog] = useState(false)

  // CSS class hides navbar/sidebar/toolbar, iframe fills viewport
  useEffect(() => {
    document.documentElement.classList.toggle('doc-fullscreen-active', isFullscreen)
    document.body.style.overflow = isFullscreen ? 'hidden' : ''
    return () => {
      document.documentElement.classList.remove('doc-fullscreen-active')
      document.body.style.overflow = ''
    }
  }, [isFullscreen])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(v => !v)
  }, [])

  // Scroll iframe to text matching a keyword (used by ShadowTypingPanel refs)
  const scrollToText = useCallback((keyword: string) => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return
    const doc = iframe.contentDocument
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const lower = keyword.toLowerCase()
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.toLowerCase().includes(lower)) {
        const range = doc.createRange()
        const idx = node.textContent.toLowerCase().indexOf(lower)
        range.setStart(node, idx)
        range.setEnd(node, idx + keyword.length)
        range.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Flash highlight — use CSS outline on parent to avoid DOM mutation issues
        const parent = range.startContainer.parentElement
        if (parent) {
          parent.style.transition = 'outline-color 0.3s'
          parent.style.outline = '2px solid rgba(99, 102, 241, 0.6)'
          parent.style.outlineOffset = '1px'
          parent.style.borderRadius = '2px'
          setTimeout(() => {
            parent.style.outline = ''
            parent.style.outlineOffset = ''
          }, 1500)
        }
        return
      }
    }
  }, [])

  // Escape exits CSS fullscreen (listen on both parent doc and iframe)
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't exit if focus is inside code editor panel (it handles Escape for autocomplete)
        if ((e.target as HTMLElement).closest?.('.code-editor-panel, .shadow-typing-panel')) return
        e.preventDefault()
        setIsFullscreen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    // Also listen inside iframe (events don't bubble across documents)
    const listenedDocs = new Set<Document>()
    const tryListenIframe = () => {
      const iframeDoc = iframeRef.current?.contentDocument
      if (iframeDoc && !listenedDocs.has(iframeDoc)) {
        iframeDoc.addEventListener('keydown', onKey)
        listenedDocs.add(iframeDoc)
      }
    }
    tryListenIframe()
    const iframe = iframeRef.current
    const onLoad = () => tryListenIframe()
    iframe?.addEventListener('load', onLoad)
    return () => {
      document.removeEventListener('keydown', onKey)
      iframe?.removeEventListener('load', onLoad)
      listenedDocs.forEach(d => d.removeEventListener('keydown', onKey))
    }
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

  // Intercept cross-document links inside the iframe
  // When user clicks a link to another .html doc, navigate parent instead of iframe
  useEffect(() => {
    const handleIframeMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'insighthub-navigate') return
      const filename = e.data.filename as string | undefined
      if (!filename) return
      // Find document by filename
      let target: { id: string } | undefined
      for (const d of allDocuments.values()) {
        if (d.fileName === filename) { target = d; break }
      }
      if (!target) return
      // Navigate to the linked document with current tab state
      const { from, scrollToAnnotation, ...rest } = fromState
      navigate(`/doc/${target.id}`, {
        state: Object.keys(rest).length > 0 ? rest : undefined,
      })
    }

    window.addEventListener('message', handleIframeMessage)
    return () => window.removeEventListener('message', handleIframeMessage)
  }, [navigate, fromState, allDocuments])

  // Inject link interceptor into iframe on each load
  useEffect(() => {
    if (!docId) return
    const inject = () => {
      const iframe = iframeRef.current
      if (!iframe?.contentDocument?.body) return
      // Avoid double-injection
      if (iframe.contentDocument.getElementById('__insighthub-link-interceptor')) return
      const script = iframe.contentDocument.createElement('script')
      script.id = '__insighthub-link-interceptor'
      script.textContent = `
        document.addEventListener('click', function(e) {
          var a = e.target.closest('a');
          if (!a) return;
          var href = a.getAttribute('href');
          if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
          // Only intercept .html links to other docs
          if (!/\\.html?(\\?|$)/.test(href)) return;
          // Extract filename
          var filename = href.split('/').pop().split('?')[0];
          window.parent.postMessage({ type: 'insighthub-navigate', filename: filename }, '*');
          e.preventDefault();
        });
      `
      iframe.contentDocument.head.appendChild(script)
    }
    const timer = setTimeout(inject, 500)
    return () => clearTimeout(timer)
  }, [docId])

  // Reset summary state when document changes, load cached summary
  useEffect(() => {
    setShowSummaryPanel(false)
    setIsSummaryGenerating(false)
    setSummaryError(null)
    setSummaryPoppedOut(false)
    setShowEvalPanel(false)
    setIsEvalGenerating(false)
    setEvalError(null)
    setEvalPoppedOut(false)
    setShowSimilarPanel(false)
    setSimilarPoppedOut(false)
    setShowInceptionPanel(false)
    setIsInceptionGenerating(false)
    setInceptionError(null)
    setInceptionPoppedOut(false)
    setShowChatPanel(false)
    setChatSelectedText(undefined)
    setShowChallengePanel(false)
    setChallengeSelectedText(undefined)
    setShowQuizPanel(false)
    setShowConceptPanel(false)
    setExplainState(null)
    setTranslateState(null)
    setShowScriptPanel(false)
    setIsScriptGenerating(false)
    setScriptError(null)
    setScriptPoppedOut(false)
    setScriptText(null)
    if (docId) {
      const cached = storageService.getSummaries()[docId]
      setSummaryText(cached || null)
      const evalCached = storageService.getSummaries()[`eval-${docId}`]
      setEvalResult(evalCached || null)
      const inceptionCached = storageService.getInception()[docId]
      setInceptionText(inceptionCached || null)
      const scriptCached = storageService.getScripts()[`${docId}:${scriptLang}:${scriptDuration}`]
      setScriptText(scriptCached || null)
      setIsBookmarked(storageService.isReadLater(docId))
    } else {
      setSummaryText(null)
      setEvalResult(null)
      setIsBookmarked(false)
    }
  }, [docId])

  // Track generation state (used by toolbar to show completion status)
  useEffect(() => {
    wasGenerating.current = isGenerating
  }, [isGenerating])

  // Track extraction state
  useEffect(() => {
    wasExtracting.current = isExtractingConcepts
  }, [isExtractingConcepts])

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
            storageService.saveReadingPosition(docId, win.scrollY, win.document.documentElement.scrollHeight)
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
        if (win) storageService.saveReadingPosition(docId, win.scrollY, win.document.documentElement.scrollHeight)
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
      setSummaryError(result.error || 'Generation failed')
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
      setEvalError(result.error || 'Evaluation failed')
    } else if (result.data && docId) {
      setEvalResult(result.data)
      storageService.saveSummary(`eval-${docId}`, result.data)
    }
  }, [doc, docId])

  const handleGenerateScript = useCallback(async () => {
    if (!doc) return
    setScriptText(null)
    setScriptError(null)
    setIsScriptGenerating(true)

    const docWithContent = await useDocumentStore.getState().ensureContentText(doc.id)
    const result = await generatePresentationScript(
      doc.title,
      docWithContent?.contentText || doc.contentText,
      scriptLang,
      scriptDuration,
      (text) => setScriptText(text),
    )

    setIsScriptGenerating(false)
    if (!result.success) {
      setScriptError(result.error || 'Generation failed')
    } else if (result.data && docId) {
      setScriptText(result.data)
      storageService.saveScript(`${docId}:${scriptLang}:${scriptDuration}`, result.data)
    }
  }, [doc, docId, scriptLang, scriptDuration])

  // Auto-regenerate script when language or duration changes (if panel is open and content exists)
  const scriptAutoRegenRef = useRef(false)
  useEffect(() => {
    if (!scriptAutoRegenRef.current) {
      scriptAutoRegenRef.current = true
      return // Skip on mount
    }
    if (showScriptPanel && scriptText && !isScriptGenerating && doc) {
      const cacheKey = `${docId}:${scriptLang}:${scriptDuration}`
      const cached = storageService.getScripts()[cacheKey]
      if (cached) {
        setScriptText(cached)
      } else {
        handleGenerateScript()
      }
    }
  }, [scriptLang, scriptDuration])

  const handleGenerateInception = useCallback(async () => {
    if (!doc) return
    setInceptionText(null)
    setInceptionError(null)
    setIsInceptionGenerating(true)

    const docWithContent = await useDocumentStore.getState().ensureContentText(doc.id)
    const result = await generateInception(
      doc.title,
      docWithContent?.contentText || doc.contentText,
      (text) => setInceptionText(text),
    )

    setIsInceptionGenerating(false)
    if (!result.success) {
      setInceptionError(result.error || 'Generation failed')
    } else if (result.data && docId) {
      setInceptionText(result.data)
      storageService.saveInception(docId, result.data)
    }
  }, [doc, docId])

  const handleRemoveStale = useCallback((ids: string[]) => {
    for (const id of ids) {
      removeHighlight(id, doc?.id || '')
    }
  }, [removeHighlight, doc?.id])

  const handleExtractConcepts = useCallback(async (mode: 'new' | 'regenerate' | 'append') => {
    if (!doc || !docId) return
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
      setExtractingError(docId, result.error || 'Extraction failed')
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
      setExplainState(prev => prev ? { ...prev, isStreaming: false, error: result.success ? null : (result.error || 'Explanation failed') } : prev)
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
      setTranslateState(prev => prev ? { ...prev, isStreaming: false, error: result.success ? null : (result.error || 'Translation failed') } : prev)
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

  const handleChallengeFromSelection = useCallback(() => {
    if (!selectionInfo) return
    const text = selectionInfo.text
    clearSelection()
    setChallengeSelectedText(text)
    if (doc) useDocumentStore.getState().ensureContentText(doc.id)
    setShowChallengePanel(true)
  }, [selectionInfo, clearSelection, doc])

  const handleAddTag = () => {
    if (!tagName.trim() || !docId || !doc) return
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
      const doc = allDocuments.get(docId || '')
      if (!doc) return true
      return t.documentIds.some(id => allDocuments.get(id)?.source === doc.source)
    }),
    [allTags, docId, allDocuments, workspaces]
  )

  if (!doc) {
    return (
      <div className="empty-state">
        <BookOpen size={48} />
        <h3>Document Not Found</h3>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>
    )
  }

  // Imported doc: show loading while fetching
  if (docId?.startsWith('imported-') && !importedBlobUrl) {
    return (
      <div className="empty-state">
        <Loader2 size={32} className="spin" />
        <h3>Loading Document...</h3>
      </div>
    )
  }

  const handleGenerate = async (mode: 'new' | 'regenerate' | 'append') => {
    const docWithContent = await useDocumentStore.getState().ensureContentText(doc.id)
    startGeneration(doc.id, mode, docWithContent || doc, quizDifficulty, quizQuestionCount, quizEnabledTypes)
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
        <button className="btn btn-ghost btn-sm" onClick={() => {
          const target = fromPath || `/${doc.source}`
          const { from, scrollToAnnotation, ...rest } = fromState
          navigate(target, { state: Object.keys(rest).length > 0 ? rest : undefined })
        }}>
          <ArrowLeft size={18} /> Back
        </button>

        <div className="doc-reader-toolbar-info">
          <span className="badge" style={{ background: getSourceColorBg(doc.source, workspaces), color: getSourceColor(doc.source, workspaces) }}>
            {getShortLabel(doc.source, workspaces)}
          </span>
          {catInfo && <span className="badge">{catInfo.label}</span>}
          <span className="badge">
            <FileText size={12} />
            {doc.wordCount.toLocaleString()} words
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
                <Plus size={12} /> Tags
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
                  placeholder="Enter or select tags..."
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
            className={`dr-action-btn ${doc.isRead ? 'active' : ''}`}
            onClick={() => setShowRatingDialog(true)}
          >
            <CheckCircle2 size={16} fill={doc.isRead ? 'currentColor' : 'none'} />
            <span className="dr-action-label">{doc.isRead ? 'Read' : 'Unread'}</span>
          </button>

          {/* Annotation panel toggle */}
          <button
            className={`dr-action-btn ${showAnnotationPanel || docAnnotations.length > 0 ? 'active' : ''}`}
            onClick={() => setShowAnnotationPanel(v => !v)}
          >
            <Highlighter size={16} />
            <span className="dr-action-label">Notes</span>
            {docAnnotations.length > 0 && <span className="dr-action-badge">{docAnnotations.length}</span>}
          </button>

          {/* Chat panel toggle */}
          <button
            className={`dr-action-btn ${showChatPanel || chatHistorySize > 0 ? 'active' : ''}`}
            onClick={() => setShowChatPanel(v => !v)}
          >
            <MessageCircle size={16} />
            <span className="dr-action-label">Chat</span>
            {chatHistorySize > 0 && <span className="dr-action-badge">{chatHistorySize}</span>}
          </button>

          {/* Challenge panel toggle */}
          <button
            className={`dr-action-btn ${showChallengePanel ? 'active' : ''}`}
            onClick={() => setShowChallengePanel(v => !v)}
          >
            <Swords size={16} />
            <span className="dr-action-label">Challenge</span>
          </button>

          {/* Summary panel toggle */}
          {enabledFeatures.aiSummary && (
          <button
            className={`dr-action-btn ${showSummaryPanel || summaryText ? 'active' : ''}`}
            onClick={() => {
              setSummaryPoppedOut(false)
              setShowSummaryPanel(v => {
                if (!v && !summaryText && !isSummaryGenerating && !summaryError) {
                  handleGenerateSummary()
                }
                return !v
              })
            }}
          >
            <BrainCircuit size={16} />
            <span className="dr-action-label">Summary</span>
          </button>
          )}

          {/* Inception panel toggle */}
          {enabledFeatures.aiInception && (
          <button
            className={`dr-action-btn ${showInceptionPanel || inceptionText ? 'active' : ''}`}
            onClick={() => {
              setInceptionPoppedOut(false)
              setShowInceptionPanel(v => {
                if (!v && !inceptionText && !isInceptionGenerating && !inceptionError) {
                  handleGenerateInception()
                }
                return !v
              })
            }}
          >
            <Layers size={16} />
            <span className="dr-action-label">Inception</span>
          </button>
          )}

          {/* Script panel toggle */}
          {enabledFeatures.aiScript && (
          <button
            className={`dr-action-btn ${showScriptPanel || scriptText ? 'active' : ''}`}
            onClick={() => {
              setScriptPoppedOut(false)
              setShowScriptPanel(v => !v)
            }}
          >
            <Mic size={16} />
            <span className="dr-action-label">Script</span>
          </button>
          )}

          {/* Evaluation button */}
          {enabledFeatures.aiEvaluation && (
          <button
            className={`dr-action-btn ${showEvalPanel || evalResult ? 'active' : ''}`}
            onClick={() => {
              if (isEvalGenerating) return
              setEvalPoppedOut(false)
              setShowEvalPanel(v => {
                if (!v && !evalResult && !isEvalGenerating && !evalError) {
                  handleEvaluate()
                }
                return !v
              })
            }}
            style={isEvalGenerating ? { opacity: 0.7, cursor: 'wait' } : undefined}
          >
            {isEvalGenerating ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
            <span className="dr-action-label">Evaluate</span>
          </button>
          )}

          {/* Extract concepts button */}
          {enabledFeatures.aiConcept && (
          <button
            className={`dr-action-btn ${(docConceptCount > 0 || showConceptPanel) ? 'active' : ''}`}
            onClick={() => {
              if (isExtractingConcepts) return
              if (docConceptCount > 0) {
                setShowConceptPanel(v => !v)
                setShowQuizPanel(false)
              } else {
                handleExtractConcepts('new')
              }
            }}
            style={isExtractingConcepts ? { opacity: 0.7, cursor: 'wait' } : undefined}
          >
            {isExtractingConcepts ? <Loader2 size={16} className="spin" /> : <Lightbulb size={16} />}
            <span className="dr-action-label">Concepts</span>
            {docConceptCount > 0 && <span className="dr-action-badge">{docConceptCount}</span>}
          </button>
          )}

          {/* Quiz button area */}
          {enabledFeatures.aiQuiz && (
          <button
            className={`dr-action-btn ${(existingQuiz || showQuizPanel) ? 'active' : ''}`}
            onClick={() => {
              if (isGenerating) return
              if (generatingError) {
                handleGenerate(existingQuiz ? 'regenerate' : 'new')
              } else if (existingQuiz) {
                setShowQuizPanel(v => !v)
                setShowConceptPanel(false)
              } else {
                handleGenerate('new')
              }
            }}
            style={isGenerating ? { opacity: 0.7, cursor: 'wait' } : undefined}
          >
            {isGenerating ? <Loader2 size={16} className="spin" /> : generatingError ? <RefreshCw size={16} /> : <Sparkles size={16} />}
            <span className="dr-action-label">{isGenerating ? 'Generating...' : generatingError ? 'Retry' : existingQuiz ? `Quiz (${existingQuiz.questions.length})` : 'Quiz'}</span>
            {existingQuiz && <span className="dr-action-badge">{existingQuiz.questions.length}</span>}
          </button>
          )}

          {/* Code editor button */}
          <button
            className={`dr-action-btn ${showCodeEditor ? 'active' : ''}`}
            onClick={() => { setCodeEditorText(undefined); setShowCodeEditor(v => !v) }}
          >
            <TerminalSquare size={16} />
            <span className="dr-action-label">Code</span>
          </button>

          {/* Shadow typing button */}
          <button
            className={`dr-action-btn ${showShadowTyping ? 'active' : ''}`}
            onClick={() => setShowShadowTyping(v => !v)}
          >
            <Languages size={16} />
            <span className="dr-action-label">Shadow</span>
          </button>

          {/* Whiteboard button */}
          <button
            className={`dr-action-btn ${showWhiteboard ? 'active' : ''}`}
            onClick={() => setShowWhiteboard(v => !v)}
          >
            <PenLine size={16} />
            <span className="dr-action-label">Whiteboard</span>
          </button>

          {/* Similar documents button */}
          {enabledFeatures.aiSimilarity && (
          <button
            className={`dr-action-btn ${showSimilarPanel ? 'active' : ''}`}
            onClick={() => {
              setSimilarPoppedOut(false)
              setShowSimilarPanel(v => !v)
            }}
          >
            <GitBranch size={16} />
            <span className="dr-action-label">Similar</span>
          </button>
          )}

          {/* Bookmark toggle */}
          <button
            className={`dr-action-btn ${isBookmarked ? 'active' : ''}`}
            onClick={toggleReadLater}
          >
            <Bookmark size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
            <span className="dr-action-label">{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
          </button>

          {/* Move document to another workspace */}
          <button
            className="dr-action-btn"
            onClick={() => setShowMoveDialog(true)}
            title="Move to another workspace"
          >
            <ArrowRightLeft size={16} />
            <span className="dr-action-label">Move</span>
          </button>

          {/* Delete document (move to trash) */}
          <button
            className={`dr-action-btn${trashingDoc ? ' dr-action-btn-danger' : ''}`}
            onClick={() => {
              if (!trashingDoc) {
                setTrashingDoc(true)
                setTimeout(() => setTrashingDoc(false), 3000)
                return
              }
              setTrashingDoc(false)
              useDocumentStore.getState().trashDocument(doc.id)
              navigate(fromPath || `/${doc.source}/${doc.category}`)
            }}
            title="Delete document"
          >
            <Trash2 size={16} />
            <span className="dr-action-label">{trashingDoc ? 'Confirm?' : 'Delete'}</span>
          </button>

          {/* Fullscreen */}
          <button
            className="dr-action-btn"
            onClick={toggleFullscreen}
          >
            <Maximize size={16} />
            <span className="dr-action-label">Fullscreen</span>
          </button>
        </div>
      </div>

      {backlinks.length > 0 && (
      <div className="doc-reader-titlebar">
        <div className="backlinks-panel" style={{ marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>
            Backlinks({backlinks.length}):
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
                Reference in {srcDoc?.title || 'document'}
              </Link>
            )
          })}
        </div>
      </div>
      )}

      <div className="doc-reader-content">
        <iframe
          key={docId}
          ref={iframeRef}
          src={iframeSrc}
          className="doc-reader-iframe"
          style={{ background: '#fff', border: 'none', flex: 1, display: (showQuizPanel || showConceptPanel) ? 'none' : undefined }}
          title={doc.title}
        />

        {showAnnotationPanel && !showQuizPanel && !showConceptPanel && (
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

        {enabledFeatures.aiSummary && showSummaryPanel && !showQuizPanel && !showConceptPanel && (
          <SummaryPanel
            summaryText={summaryText}
            isGenerating={isSummaryGenerating}
            error={summaryError}
            onGenerate={handleGenerateSummary}
            onClose={() => { setShowSummaryPanel(false); setSummaryPoppedOut(false) }}
            poppedOut={summaryPoppedOut}
            onTogglePopup={() => setSummaryPoppedOut(v => !v)}
          />
        )}

        {enabledFeatures.aiEvaluation && showEvalPanel && !showQuizPanel && !showConceptPanel && (
          <EvaluationPanel
            resultText={evalResult}
            isGenerating={isEvalGenerating}
            error={evalError}
            onGenerate={handleEvaluate}
            onClose={() => { setShowEvalPanel(false); setEvalPoppedOut(false) }}
            poppedOut={evalPoppedOut}
            onTogglePopup={() => setEvalPoppedOut(v => !v)}
          />
        )}

        {enabledFeatures.aiInception && showInceptionPanel && !showQuizPanel && !showConceptPanel && (
          <InceptionPanel
            inceptionText={inceptionText}
            isGenerating={isInceptionGenerating}
            error={inceptionError}
            onGenerate={handleGenerateInception}
            onClose={() => { setShowInceptionPanel(false); setInceptionPoppedOut(false) }}
            poppedOut={inceptionPoppedOut}
            onTogglePopup={() => setInceptionPoppedOut(v => !v)}
          />
        )}

        {enabledFeatures.aiScript && showScriptPanel && !showQuizPanel && !showConceptPanel && (
          <ScriptPanel
            scriptText={scriptText}
            isGenerating={isScriptGenerating}
            error={scriptError}
            language={scriptLang}
            duration={scriptDuration}
            onLanguageChange={setScriptLang}
            onDurationChange={setScriptDuration}
            onGenerate={handleGenerateScript}
            onClose={() => { setShowScriptPanel(false); setScriptPoppedOut(false) }}
            poppedOut={scriptPoppedOut}
            onTogglePopup={() => setScriptPoppedOut(v => !v)}
          />
        )}

        {showChatPanel && !showQuizPanel && !showConceptPanel && (
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

        {showChallengePanel && !showQuizPanel && !showConceptPanel && (
          <ChallengePanel
            key={docId}
            documentId={docId || ''}
            documentContent={doc.contentText}
            selectedText={challengeSelectedText}
            onClose={() => { setShowChallengePanel(false); setChallengeSelectedText(undefined) }}
            onSelectionUsed={() => setChallengeSelectedText(undefined)}
          />
        )}

        {enabledFeatures.aiSimilarity && showSimilarPanel && !showQuizPanel && !showConceptPanel && (
          <SimilarDocsPanel
            docId={docId || ''}
            onClose={() => { setShowSimilarPanel(false); setSimilarPoppedOut(false) }}
            poppedOut={similarPoppedOut}
            onTogglePopup={() => setSimilarPoppedOut(v => !v)}
          />
        )}

        {showQuizPanel && <QuizPanel docId={doc.id} onClose={() => setShowQuizPanel(false)} />}
        {showConceptPanel && <ConceptCardsPanel docId={doc.id} onClose={() => setShowConceptPanel(false)} />}
      </div>

      {/* Fullscreen floating mini-toolbar — hover to reveal */}
      {isFullscreen && (
        <div className="fs-float-toolbar">
          <button
            className={`dr-action-btn${showCodeEditor ? ' active' : ''}`}
            onClick={() => setShowCodeEditor(v => !v)}
            title="Code Editor"
          >
            <TerminalSquare size={14} />
          </button>
          <button
            className={`dr-action-btn${showShadowTyping ? ' active' : ''}`}
            onClick={() => setShowShadowTyping(v => !v)}
            title="Shadow Typing"
          >
            <Languages size={14} />
          </button>
          <button
            className={`dr-action-btn${showWhiteboard ? ' active' : ''}`}
            onClick={() => setShowWhiteboard(v => !v)}
            title="Whiteboard"
          >
            <PenLine size={14} />
          </button>
          <button
            className="dr-action-btn"
            onClick={toggleFullscreen}
            title="Exit Fullscreen"
          >
            <Minimize size={14} />
          </button>
        </div>
      )}

      {/* Floating code editor panel — floats above iframe */}
      {showCodeEditor && docId && (
        <Suspense fallback={null}>
          <CodeEditorPanel docId={docId} initialText={codeEditorText} onClose={() => setShowCodeEditor(false)} />
        </Suspense>
      )}

      {/* Floating shadow typing panel */}
      {showShadowTyping && docId && (
        <Suspense fallback={null}>
          <ShadowTypingPanel docId={docId} onClose={() => setShowShadowTyping(false)} onScrollToText={scrollToText} />
        </Suspense>
      )}

      {/* Floating whiteboard panel */}
      {showWhiteboard && docId && (
        <Suspense fallback={null}>
          <WhiteboardPanel docId={docId} onClose={() => setShowWhiteboard(false)} />
        </Suspense>
      )}

      {/* Floating annotation bar */}
      {selectionInfo && (
        <AnnotationBar
          selectionInfo={selectionInfo}
          onHighlight={handleHighlight}
          onComment={() => setShowCommentDialog(true)}
          onExplain={handleExplain}
          onTranslate={handleTranslate}
          onAskAI={handleAskAI}
          onOpenCodeEditor={(text) => { setCodeEditorText(text); setShowCodeEditor(true) }}
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

      {/* Rating dialog */}
      {showRatingDialog && doc && (
        <RatingDialog
          docTitle={doc.title}
          currentRating={doc.isRead ? doc.rating : undefined}
          onRate={(rating) => {
            setShowRatingDialog(false)
            if (doc.isRead) {
              updateRating(doc.id, rating)
            } else {
              markAsRead(doc.id, rating)
            }
          }}
          onSkip={() => {
            setShowRatingDialog(false)
            if (!doc.isRead) markAsRead(doc.id)
          }}
          onMarkUnread={() => {
            setShowRatingDialog(false)
            toggleRead(doc.id)
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
          title="Concept Explanation"
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
          title="Translation"
          icon={<Languages size={14} />}
          streamingText={translateState.streamingText}
          isStreaming={translateState.isStreaming}
          error={translateState.error}
          onClose={() => setTranslateState(null)}
        />
      )}

      {showMoveDialog && doc && (
        <MoveDocumentDialog
          doc={doc}
          onClose={() => setShowMoveDialog(false)}
          onMoved={(newId) => {
            setShowMoveDialog(false)
            navigate(`/doc/${newId}`, { replace: true })
          }}
        />
      )}
    </div>
  )
}
