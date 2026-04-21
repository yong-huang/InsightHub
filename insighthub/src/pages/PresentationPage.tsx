import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Maximize,
  Edit3, ArrowLeft, FileText, Loader2, RefreshCw, X,
} from 'lucide-react'
import { parseSections, type ParsedSection } from '@/utils/sectionParser'
import { usePresentationStore } from '@/stores/presentationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useDocumentUrl } from '@/hooks/useDocumentUrl'
import { generateSpeakerNotes } from '@/services/aiService'

/**
 * JS string injected into the presentation iframe.
 * On load, it:
 *  1. Removes nav/footer/header/script chrome (but keeps hero section as cover).
 *  2. Walks all elements, assigning data-pres-section based on h2/h3 headings.
 *     Elements BEFORE a heading that are preceding siblings of that heading in
 *     the same parent (e.g. section-tag badges) are reassigned to the heading's
 *     section so they don't bleed into the previous slide.
 *  3. Reassigns non-hero section-0 elements to section 1 so hero is standalone.
 *  4. Uses JS-based visibility to show/hide sections.
 *  5. Exposes window.__presShow(idx) to switch slides.
 *
 * Section numbering: 0 = hero only, 1 = first h2, 2 = second heading...
 * The React component calls __presShow(sectionParserIndex + 1).
 */
const IFRAME_SETUP_JS = `
(function() {
  // Remove chrome but keep hero/cover sections
  ['script','nav','.nav','footer','header','noscript','.back-to-top'].forEach(function(sel) {
    document.querySelectorAll(sel).forEach(function(el) { el.remove(); });
  });
  // Remove external <link rel="stylesheet"> to avoid conflicts,
  // but KEEP <style> tags so document layout (grid, flex, colors, fonts) is preserved.
  Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).forEach(function(el) { el.remove(); });

  document.body.style.margin = '0';
  document.body.style.padding = '0';

  // Inject targeted overrides with !important to neutralize document styles
  // that conflict with presentation mode, while keeping layout intact.
  // Key principle: only override what's necessary, don't touch display/grid/flex.
  var s = document.createElement('style');
  s.textContent = ''
    // Base
    + 'html, body { height: 100% !important; }'
    // Force all elements visible (replaces scroll-reveal opacity:0)
    + 'body * { opacity: 1 !important; visibility: visible !important; }'
    // Sections: fill slide width, allow internal scroll when content overflows
    + 'section, .sec { min-height: 0 !important; max-width: 100% !important; width: 100% !important; padding: 0.8rem 2rem !important; margin: 0 !important; box-sizing: border-box !important; }'
    + '.sh { margin-bottom: 0.6rem !important; text-align: center !important; }'
    // Hero: remove 100vh sizing, hide particle decorations
    + '.hero { min-height: 0 !important; height: auto !important; padding: 2rem !important; }'
    + '.particles, .particle { display: none !important; }';
  document.head.appendChild(s);

  var heroSection = document.querySelector('section.hero, section[class*="hero"]');
  var hasHero = !!heroSection;
  window.__presHasHero = hasHero;

  // Find all headings
  var headings = [];
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  var node;
  while ((node = walker.nextNode())) {
    if (node.tagName === 'H2' || node.tagName === 'H3') {
      headings.push(node);
    }
  }

  var total = headings.length;
  if (total === 0) return;
  window.__presTotal = total + 1; // +1 for hero/pre-heading slide

  // Walk all elements and assign section index (skip body itself).
  // sectionIdx starts at 0: hero elements get 0, first h2 gets 1, etc.
  var sectionIdx = 0;
  // Track first heading per parent to fix preceding-sibling bleed
  var headingParentMap = new Map();

  walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  while ((node = walker.nextNode())) {
    if (node === document.body) continue;
    if (node.tagName === 'H2' || node.tagName === 'H3') {
      sectionIdx++;
      // Fix: reassign preceding siblings in the same parent to this heading's section.
      // This catches section-tag badges (e.g. "Scene 02") that appear before h2.
      // Only do this for H2 — H3 sub-headings should NOT steal preceding content
      // from their parent H2 section.
      if (node.tagName === 'H2' && !headingParentMap.has(node.parentElement)) {
        headingParentMap.set(node.parentElement, sectionIdx);
        var sibling = node.previousElementSibling;
        while (sibling) {
          sibling.setAttribute('data-pres-section', String(sectionIdx));
          sibling = sibling.previousElementSibling;
        }
      }
    }
    node.setAttribute('data-pres-section', String(sectionIdx));
  }

  // Reassign non-hero section-0 elements to section 1 so hero is a standalone slide.
  // Without this, section.sec wrappers before the first heading would appear
  // on the hero slide.
  if (heroSection) {
    var allZero = document.querySelectorAll('[data-pres-section="0"]');
    for (var i = 0; i < allZero.length; i++) {
      if (!heroSection.contains(allZero[i])) {
        allZero[i].setAttribute('data-pres-section', '1');
      }
    }
  }

  var allMarked = document.querySelectorAll('[data-pres-section]');

  window.__presShow = function(idx) {
    // Step 1: hide all marked elements
    for (var i = 0; i < allMarked.length; i++) {
      allMarked[i].style.setProperty('display', 'none', 'important');
    }

    // Step 2: collect target section elements + all their ancestors
    var targets = document.querySelectorAll('[data-pres-section="' + idx + '"]');
    var visible = new Set();
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      visible.add(el);
      var ancestor = el.parentElement;
      while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
        visible.add(ancestor);
        ancestor = ancestor.parentElement;
      }
    }

    // Step 3: show visible elements
    visible.forEach(function(el) {
      el.style.removeProperty('display');
    });

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  // Initially show hero slide
  window.__presShow(0);
})();
`

export function PresentationPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()

  const [sections, setSections] = useState<ParsedSection[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [iframeReady, setIframeReady] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [animClass, setAnimClass] = useState('')
  const [isAnimating, setIsAnimating] = useState(false)
  const [slideOrder, setSlideOrder] = useState<number[]>([])
  const [speakerNotesMap, setSpeakerNotesMap] = useState<Record<number, string>>({})
  const [heroExists, setHeroExists] = useState(false)
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false)
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 })

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const presentation = usePresentationStore(s => s.getByDocumentId(docId!))
  const updateSpeakerNotes = usePresentationStore(s => s.updateSpeakerNotes)
  const doc = useDocumentStore(s => s.documents.get(docId!))
  const docUrl = useDocumentUrl(docId!)

  // Parse sections
  useEffect(() => {
    if (!docId) return
    setLoading(true)
    parseSections(docId).then(parsed => {
      setSections(parsed)
      if (presentation) {
        setSlideOrder(presentation.slideOrder)
        setSpeakerNotesMap(presentation.speakerNotes)
      } else {
        setSlideOrder(parsed.map((_, i) => i))
        setSpeakerNotesMap({})
      }
      setLoading(false)
    })
  }, [docId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show the current section in the iframe
  // heroSlide: show iframe section 0 (hero)
  // heading slides: show iframe section (sectionParserIndex + 1)
  const showSection = useCallback((sectionIdx: number, isHero: boolean) => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    const win = iframe.contentWindow as any
    if (typeof win.__presShow === 'function') {
      win.__presShow(isHero ? 0 : sectionIdx + 1)
    }
  }, [])

  // Iframe load: inject setup script, then show current section
  // Depends on [loading] so it re-runs after the iframe is rendered
  // (loading starts true → iframe not in DOM; becomes false → iframe renders).
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument
        if (!doc) return

        // Inject setup script
        const script = doc.createElement('script')
        script.textContent = IFRAME_SETUP_JS
        doc.body.appendChild(script)

        // Check if document has a hero section
        const hasHero = !!(iframe.contentWindow as any).__presHasHero
        setHeroExists(hasHero)

        setIframeReady(true)
      } catch {
        // Cross-origin
      }
    }

    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [loading])

  const hasHero = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return false
    return !!(iframe.contentWindow as any).__presHasHero
  }, [])

  // When iframe is ready + currentIndex changes, show the right section
  // currentIndex 0 = hero (if present), 1+ = heading sections
  useEffect(() => {
    if (!iframeReady) return
    if (currentIndex === 0 && hasHero()) {
      showSection(0, true)
    } else {
      const headingIdx = hasHero() ? currentIndex - 1 : currentIndex
      const sectionIdx = slideOrder[headingIdx]
      if (sectionIdx !== undefined) {
        showSection(sectionIdx, false)
      }
    }
  }, [iframeReady, currentIndex, slideOrder, showSection, hasHero])

  // BroadcastChannel for presenter mode
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('presentation-sync')
      channelRef.current = channel
      channel.onmessage = (e) => {
        if (e.data.type === 'go-to-slide' && typeof e.data.index === 'number') {
          goToSlide(e.data.index)
        }
      }
    } catch {
      // BroadcastChannel not supported
    }
    return () => {
      channelRef.current?.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast slide changes
  useEffect(() => {
    channelRef.current?.postMessage({ type: 'current-slide', index: currentIndex })
  }, [currentIndex])

  const activeSlides = slideOrder
    .map(i => sections[i])
    .filter(Boolean)

  // Hero is a virtual slide 0 if the document has a hero section
  const totalSlides = activeSlides.length + (heroExists ? 1 : 0)

  const goToSlide = useCallback((index: number, direction?: 'forward' | 'backward') => {
    if (isAnimating || index < 0 || index >= totalSlides) return
    setIsAnimating(true)

    const dir = direction ?? (index > currentIndex ? 'forward' : 'backward')
    const outClass = dir === 'forward' ? 'slide-animate-out' : 'slide-animate-out-reverse'
    const inClass = dir === 'forward' ? 'slide-animate-in' : 'slide-animate-in-reverse'

    setAnimClass(outClass)
    setTimeout(() => {
      setCurrentIndex(index)
      setAnimClass(inClass)
      setTimeout(() => {
        setAnimClass('')
        setIsAnimating(false)
      }, 300)
    }, 200)
  }, [currentIndex, totalSlides, isAnimating])

  const goNext = useCallback(() => {
    if (currentIndex < totalSlides - 1) {
      goToSlide(currentIndex + 1, 'forward')
    }
  }, [currentIndex, totalSlides, goToSlide])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      goToSlide(currentIndex - 1, 'backward')
    }
  }, [currentIndex, goToSlide])

  // Fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Fullscreen not supported or blocked
    }
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
          e.preventDefault()
          goNext()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault()
          goPrev()
          break
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            navigate(`/doc/${docId}`)
          }
          break
        case 'F5':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrev, toggleFullscreen, navigate])

  const openPresenterMode = useCallback(() => {
    const w = window.open('', 'presenter', 'width=800,height=600')
    if (!w) return
    w.document.write(generatePresenterHTML(activeSlides, currentIndex, speakerNotesMap, slideOrder, docUrl))
    w.document.close()
  }, [activeSlides, currentIndex, speakerNotesMap, slideOrder, docUrl])

  const handleGenerateScript = useCallback(async () => {
    if (isGeneratingScript) return
    setIsGeneratingScript(true)
    setGenProgress({ done: 0, total: activeSlides.length })

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const sectionsData = activeSlides.map(s => ({
        title: s.title,
        contentHtml: s.contentHtml,
      }))

      const notes = await generateSpeakerNotes(
        doc?.title || 'Untitled',
        sectionsData,
        (done, total) => setGenProgress({ done, total }),
        abort.signal,
      )

      // Merge new notes into existing
      const merged = { ...speakerNotesMap, ...notes }
      setSpeakerNotesMap(merged)

      // Persist to store
      const presId = presentation?.id
      if (presId) {
        for (const [idx, text] of Object.entries(notes)) {
          updateSpeakerNotes(presId, Number(idx), text)
        }
      }

      setScriptPanelOpen(true)
    } catch (e: any) {
      console.error('[PresentationPage] generateSpeakerNotes failed:', e)
      alert(e.message || '生成演讲稿失败')
    } finally {
      setIsGeneratingScript(false)
      abortRef.current = null
    }
  }, [isGeneratingScript, activeSlides, doc?.title, speakerNotesMap, presentation?.id, updateSpeakerNotes])

  if (loading) {
    return (
      <div className="presentation-page">
        <div className="presentation-empty">
          <div className="presentation-empty-icon">Loading...</div>
        </div>
      </div>
    )
  }

  if (totalSlides === 0) {
    return (
      <div className="presentation-page">
        <div className="presentation-empty">
          <div className="presentation-empty-icon">No slides</div>
          <p>This document has no sections (h2/h3 headings) to create slides from.</p>
          <Link to={doc ? `/${doc.source}` : '/'} className="btn btn-secondary">
            <ArrowLeft size={16} /> Back
          </Link>
        </div>
      </div>
    )
  }

  const currentSlide = currentIndex === 0 && heroExists
    ? { title: doc?.title || 'Cover', level: 2 as const, contentHtml: '' }
    : activeSlides[heroExists ? currentIndex - 1 : currentIndex]
  const progress = totalSlides > 1 ? ((currentIndex + 1) / totalSlides) * 100 : 100

  return (
    <div className={`presentation-page ${isFullscreen ? 'presentation-fullscreen' : ''}`}>
      {/* Top bar actions (non-fullscreen only) */}
      {!isFullscreen && (
        <div style={{
          position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10,
          display: 'flex', gap: '0.5rem',
        }}>
          <button className="btn btn-ghost btn-sm" onClick={toggleFullscreen} title="Fullscreen (F5)">
            <Maximize size={16} />
          </button>
          <Link
            to={`/presentation/${docId}/edit`}
            className="btn btn-ghost btn-sm"
            title="Edit Slides"
          >
            <Edit3 size={16} />
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/doc/${docId}`)} title="Back">
            <ArrowLeft size={16} />
          </button>
          <button
            className={`btn btn-ghost btn-sm ${scriptPanelOpen ? 'active' : ''}`}
            onClick={() => {
              if (isGeneratingScript) return
              const hasNotes = Object.keys(speakerNotesMap).length > 0
              if (hasNotes) {
                setScriptPanelOpen(p => !p)
              } else {
                handleGenerateScript()
              }
            }}
            title={isGeneratingScript ? 'Generating...' : 'Speaker Notes'}
          >
            {isGeneratingScript ? (
              <><Loader2 size={16} className="spin" /> 生成中 {genProgress.done}/{genProgress.total}</>
            ) : (
              <><FileText size={16} /> 演讲稿</>
            )}
          </button>
        </div>
      )}

      {/* Slide */}
      <div className="presentation-slide-wrapper">
        <div className={`presentation-slide ${animClass}`}>
          <div className="presentation-slide-iframe-wrapper">
            <iframe
              ref={iframeRef}
              src={docUrl}
              className="presentation-slide-iframe"
              title={currentSlide.title}
            />
          </div>
        </div>
        <div className="presentation-slide-footer">
          <span>{currentSlide.title}</span>
          <span>{currentIndex + 1} / {totalSlides}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="presentation-progress">
        <div className="presentation-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {/* Navigation */}
      <div className="presentation-nav">
        <button onClick={goPrev} disabled={currentIndex === 0}>
          <ChevronLeft size={18} /> Prev
        </button>
        <span className="presentation-slide-counter">
          {currentIndex + 1} / {totalSlides}
        </span>
        <button onClick={goNext} disabled={currentIndex === totalSlides - 1}>
          Next <ChevronRight size={18} />
        </button>
      </div>

      {/* Speaker notes panel */}
      {scriptPanelOpen && (
        <div className="presentation-notes-panel" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          padding: '0.75rem 1rem', maxHeight: '30vh', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              演讲稿 — {currentSlide.title}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={handleGenerateScript} disabled={isGeneratingScript} title="重新生成">
                <RefreshCw size={14} /> 重新生成
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setScriptPanelOpen(false)} title="关闭">
                <X size={14} />
              </button>
            </div>
          </div>
          {(() => {
            const noteIdx = heroExists ? currentIndex - 1 : currentIndex
            const sectionIdx = slideOrder[noteIdx]
            const notes = sectionIdx !== undefined ? speakerNotesMap[sectionIdx] : undefined
            if (!notes) {
              return <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>暂无演讲稿，请点击"演讲稿"按钮生成</div>
            }
            return (
              <textarea
                value={notes}
                onChange={e => {
                  const newMap = { ...speakerNotesMap, [sectionIdx]: e.target.value }
                  setSpeakerNotesMap(newMap)
                }}
                onBlur={() => {
                  const presId = presentation?.id
                  if (presId && sectionIdx !== undefined) {
                    updateSpeakerNotes(presId, sectionIdx, speakerNotesMap[sectionIdx])
                  }
                }}
                style={{
                  flex: 1, minHeight: '80px', width: '100%', resize: 'none',
                  background: 'var(--surface-alt)', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '0.75rem', fontSize: '0.9rem',
                  lineHeight: 1.6, color: 'var(--text-primary)',
                }}
              />
            )
          })()}
        </div>
      )}
    </div>
  )
}

function generatePresenterHTML(
  slides: ParsedSection[],
  currentIdx: number,
  notesMap: Record<number, string>,
  slideOrder: number[],
  docUrl: string,
) {
  const current = slides[currentIdx]
  const next = slides[currentIdx + 1]
  const notes = notesMap[slideOrder[currentIdx]] || ''

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Presenter View</title>
<style>
body { margin: 0; background: #1a1a2e; color: #fff; font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 1rem; height: 100vh; display: flex; flex-direction: column; box-sizing: border-box; }
.current { flex: 1; display: flex; align-items: center; justify-content: center; margin-bottom: 0.75rem; min-height: 0; }
.current iframe { width: min(70vw, calc(70vh * 16/9)); height: calc(min(70vw, calc(70vh * 16/9)) * 9 / 16); border: none; border-radius: 8px; background: #fff; }
.next-section { height: 15vh; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 0.75rem; font-size: 0.85rem; color: rgba(255,255,255,0.5); }
.notes-section { height: 15vh; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 0.75rem; overflow-y: auto; font-size: 0.9rem; color: rgba(255,255,255,0.7); line-height: 1.5; }
.footer { text-align: center; font-size: 0.75rem; color: rgba(255,255,255,0.3); margin-top: 0.5rem; }
</style>
</head><body>
<div class="current">
  <iframe src="${docUrl}" data-section="${slideOrder[currentIdx]}"></iframe>
</div>
<div class="next-section">
  ${next ? `Next: <strong>${escapeHtml(next.title)}</strong>` : 'No more slides'}
</div>
<div class="notes-section">
  ${notes ? escapeHtml(notes).replace(/\n/g, '<br>') : '<em>No speaker notes</em>'}
</div>
<div class="footer">Slide ${currentIdx + 1} / ${slides.length}</div>
<script>
document.querySelectorAll('iframe').forEach(function(iframe) {
  iframe.addEventListener('load', function() {
    var doc = iframe.contentDocument;
    if (!doc) return;

    if (doc.body) {
      doc.body.style.margin = '0';
      doc.body.style.padding = '0';
    }

    // Inject the same setup script
    var script = doc.createElement('script');
    script.textContent = (${JSON.stringify(IFRAME_SETUP_JS)});
    doc.body.appendChild(script);

    // Show the target section (add 1 offset: iframe section 0 = hero)
    var sectionIdx = parseInt(iframe.getAttribute('data-section'));
    if (typeof doc.defaultView.__presShow === 'function') {
      doc.defaultView.__presShow(sectionIdx + 1);
    }
  });
});

var ch = new BroadcastChannel('presentation-sync');
ch.onmessage = function(e) {
  if (e.data.type === 'current-slide') location.reload();
};
</script>
</body></html>`
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
