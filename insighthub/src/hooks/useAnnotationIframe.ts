import { useState, useCallback, useRef, useEffect } from 'react'
import { useAnnotationStore } from '@/stores/annotationStore'
import type { Annotation } from '@/types'
import { HIGHLIGHT_COLORS } from '@/types'
import { rangeToXPath, xpathToRange, findTextRange, applyMarkToRange, restoreMarkFromRange } from '@/utils/xpath'

export interface SelectionInfo {
  text: string
  range: Range
  rect: DOMRect
}

export function useAnnotationIframe(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null)
  const addAnnotation = useAnnotationStore(s => s.addAnnotation)
  const removeAnnotation = useAnnotationStore(s => s.removeAnnotation)
  const allAnnotations = useAnnotationStore(s => s.annotations)
  const restoreTimeoutRef = useRef<number | null>(null)

  const getIframeDoc = useCallback((): Document | null => {
    try {
      return iframeRef.current?.contentDocument || null
    } catch {
      return null
    }
  }, [iframeRef])

  const handleMouseUp = useCallback(() => {
    const doc = getIframeDoc()
    if (!doc) return

    const selection = doc.defaultView?.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return
    }

    const range = selection.getRangeAt(0)
    const text = selection.toString().trim()

    if (!text || text.length < 1) return

    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return

    setSelectionInfo({ text, range, rect })
  }, [getIframeDoc])

  const clearSelection = useCallback(() => {
    const doc = getIframeDoc()
    if (doc) {
      doc.defaultView?.getSelection()?.removeAllRanges()
    }
    setSelectionInfo(null)
  }, [getIframeDoc])

  const addHighlight = useCallback((
    documentId: string,
    color: string = HIGHLIGHT_COLORS[0],
    comment?: string,
  ) => {
    if (!selectionInfo) return

    const range = selectionInfo.range
    const text = selectionInfo.text

    const xpath = rangeToXPath(range)
    const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const annotation: Annotation = {
      id,
      documentId,
      type: comment ? 'comment' : 'highlight',
      text,
      color,
      comment,
      xpath,
      createdAt: Date.now(),
    }

    addAnnotation(annotation)
    applyMarkToRange(range, id, color)
    clearSelection()
  }, [selectionInfo, addAnnotation, clearSelection])

  const removeHighlight = useCallback((annotationId: string, _documentId: string) => {
    const doc = getIframeDoc()
    if (!doc) return

    // Cancel any pending restore to prevent re-applying deleted marks
    if (restoreTimeoutRef.current) {
      clearTimeout(restoreTimeoutRef.current)
      restoreTimeoutRef.current = null
    }

    // Remove all marks with this ID (cross-element annotations have multiple)
    const marks = doc.querySelectorAll(`mark[data-annotation-id="${annotationId}"]`)
    for (const mark of marks) {
      const parent = mark.parentNode
      if (parent) {
        parent.replaceChild(doc.createTextNode(mark.textContent || ''), mark)
      }
    }
    // Normalize merged text nodes
    doc.body?.normalize()

    removeAnnotation(annotationId)
  }, [getIframeDoc, removeAnnotation])

  const restoreHighlights = useCallback((documentId: string) => {
    const doc = getIframeDoc()
    if (!doc) return

    if (restoreTimeoutRef.current) {
      clearTimeout(restoreTimeoutRef.current)
    }

    const doRestore = () => {
      const annotations = allAnnotations.filter(a => a.documentId === documentId)

      // Phase 1: Collect all ranges BEFORE modifying the DOM
      const pending: { annotation: Annotation; range: Range }[] = []
      for (const annotation of annotations) {
        if (doc.querySelector(`mark[data-annotation-id="${annotation.id}"]`)) continue

        let range = xpathToRange(doc, annotation.xpath)
        if (!range) {
          range = findTextRange(doc, annotation.text)
        }
        if (range) {
          pending.push({ annotation, range })
        }
      }

      // Phase 2: Apply in reverse document order so earlier DOM positions stay valid
      // Use the safe restoreMarkFromRange which splits text nodes instead of extractContents
      for (let i = pending.length - 1; i >= 0; i--) {
        const { annotation, range } = pending[i]
        try {
          restoreMarkFromRange(range, annotation.id, annotation.color)
        } catch {
          // skip
        }
      }
    }

    restoreTimeoutRef.current = window.setTimeout(doRestore, 500)
  }, [getIframeDoc, allAnnotations])

  const scrollToAnnotation = useCallback((annotationId: string) => {
    const doc = getIframeDoc()
    if (!doc) return

    const marks = doc.querySelectorAll(`mark[data-annotation-id="${annotationId}"]`)
    if (marks.length === 0) return

    const firstMark = marks[0] as HTMLElement
    firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Flash effect: temporarily brighten all marks for this annotation
    marks.forEach(m => {
      const el = m as HTMLElement
      el.style.transition = 'outline-color 0.3s'
      el.style.outline = '2px solid var(--accent-blue, #326ce5)'
      el.style.outlineOffset = '1px'
    })
    setTimeout(() => {
      marks.forEach(m => {
        const el = m as HTMLElement
        el.style.outline = ''
        el.style.outlineOffset = ''
      })
    }, 1500)
  }, [getIframeDoc])

  // Setup mouseup listener on iframe
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const onLoad = () => {
      const doc = getIframeDoc()
      if (!doc) return

      doc.addEventListener('mouseup', handleMouseUp)
    }

    iframe.addEventListener('load', onLoad)

    // If iframe already loaded
    if (iframe.contentDocument) {
      onLoad()
    }

    return () => {
      iframe.removeEventListener('load', onLoad)
      const doc = getIframeDoc()
      if (doc) {
        doc.removeEventListener('mouseup', handleMouseUp)
      }
      if (restoreTimeoutRef.current) {
        clearTimeout(restoreTimeoutRef.current)
      }
    }
  }, [iframeRef, getIframeDoc, handleMouseUp])

  return {
    selectionInfo,
    clearSelection,
    addHighlight,
    removeHighlight,
    restoreHighlights,
    scrollToAnnotation,
  }
}
