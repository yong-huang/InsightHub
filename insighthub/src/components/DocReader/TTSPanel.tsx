import { useEffect } from 'react'
import { Volume2, Pause, Square, Play, X, Maximize, Minimize, AlertCircle, Globe, Monitor } from 'lucide-react'
import { useTextToSpeech, SPEED_OPTIONS } from '@/hooks/useTextToSpeech'
import { useDocumentStore } from '@/stores/documentStore'
import { splitSentences } from '@/hooks/useTextToSpeech'

interface TTSPanelProps {
  docId: string
  docLanguage: string
  onClose: () => void
  poppedOut?: boolean
  onTogglePopup?: () => void
}

export function TTSPanel({ docId, docLanguage, onClose, poppedOut, onTogglePopup }: TTSPanelProps) {
  const tts = useTextToSpeech()

  // Stop TTS on unmount
  useEffect(() => {
    return () => { tts.stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ensure contentText is available
  useEffect(() => {
    if (tts.status === 'idle') {
      useDocumentStore.getState().ensureContentText(docId)
    }
  }, [docId, tts.status])

  const handlePlay = () => {
    const doc = useDocumentStore.getState().documents.get(docId)
    if (!doc) return
    const text = doc.contentText || ''
    if (!text) return
    tts.play(text, docLanguage)
  }

  // Filter voices by language
  const langPrefix = docLanguage === 'zh' ? 'zh' : 'en'
  const filteredVoices = tts.voices.filter(v => v.lang.toLowerCase().startsWith(langPrefix))

  // Sort by quality (best first)
  const sortedVoices = [...filteredVoices].sort((a, b) => {
    const score = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase()
      return (n.includes('enhanced') ? 5 : 0) + (n.includes('natural') ? 6 : 0) +
        (n.includes('neural') ? 7 : 0) + (n.includes('premium') ? 8 : 0) + (v.localService ? 2 : 0)
    }
    return score(b) - score(a)
  })

  // Label voice quality
  const voiceLabel = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase()
    if (n.includes('premium') || n.includes('neural')) return v.name + ' ★★★'
    if (n.includes('natural') || n.includes('enhanced')) return v.name + ' ★★'
    if (v.localService) return v.name + ' ★'
    return v.name
  }

  // Get sentences for context display
  const doc = useDocumentStore(s => s.documents).get(docId)
  const allSentences = doc?.contentText ? splitSentences(doc.contentText) : []
  const ctxStart = Math.max(0, tts.currentSentence - 2)
  const ctxEnd = Math.min(allSentences.length, tts.currentSentence + 2)

  const isApiEngine = tts.engine === 'api' && !!tts.ttsConfig.ttsApiUrl

  const panelContent = (
    <>
      <div className="summary-panel-header">
        <h3>Read Aloud</h3>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="summary-panel-close" onClick={onTogglePopup} title={poppedOut ? 'Minimize' : 'Expand'}>
            {poppedOut ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button className="summary-panel-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="summary-panel-body">
        {tts.status === 'idle' && tts.totalSentences === 0 && !tts.error && (
          <div className="summary-panel-empty">
            <Volume2 size={32} />
            <p>Text-to-Speech</p>
            <p className="summary-panel-empty-hint">
              {isApiEngine
                ? `API: ${tts.ttsConfig.ttsModel || 'default model'}${tts.ttsConfig.ttsVoice ? ' / ' + tts.ttsConfig.ttsVoice : ''}`
                : 'Browser TTS — select a high-quality voice for better results'}
            </p>
            <button className="btn btn-primary btn-sm" onClick={handlePlay}>
              <Play size={14} /> Play
            </button>
          </div>
        )}

        {tts.error && (
          <div className="summary-panel-error">
            <AlertCircle size={14} />
            <p>{tts.error}</p>
            <button className="btn btn-secondary btn-sm" onClick={tts.stop}>
              Dismiss
            </button>
          </div>
        )}

        {(tts.status !== 'idle' || tts.totalSentences > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Engine selector */}
            <div className="tts-engine-row">
              <button
                className={`tts-engine-btn ${tts.engine === 'browser' ? 'active' : ''}`}
                onClick={() => tts.setEngine('browser')}
              >
                <Monitor size={13} /> Browser
              </button>
              <button
                className={`tts-engine-btn ${tts.engine === 'api' ? 'active' : ''}`}
                onClick={() => tts.setEngine('api')}
              >
                <Globe size={13} /> API
              </button>
              {tts.engine === 'api' && isApiEngine && (
                <span className="tts-api-config-hint" onClick={() => window.open('/settings', '_self')}>
                  {tts.ttsConfig.ttsApiUrl} / {tts.ttsConfig.ttsModel || 'default'}
                </span>
              )}
              {tts.engine === 'api' && !tts.ttsConfig.ttsApiUrl && (
                <span className="tts-api-config-hint" onClick={() => window.open('/settings', '_self')}>
                  Configure in Settings →
                </span>
              )}
            </div>

            {/* Transport controls */}
            <div className="tts-transport">
              {tts.status === 'playing' ? (
                <button className="btn btn-secondary btn-sm" onClick={tts.pause} disabled={!isApiEngine && tts.engine === 'api'}>
                  <Pause size={16} /> Pause
                </button>
              ) : tts.status === 'paused' ? (
                <button className="btn btn-primary btn-sm" onClick={tts.resume}>
                  <Play size={14} /> Resume
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={handlePlay}>
                  <Play size={14} /> Play
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={tts.stop}>
                <Square size={14} /> Stop
              </button>
            </div>

            {/* Speed controls */}
            <div className="tts-speed-row">
              <span className="tts-speed-label">Speed</span>
              {SPEED_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`tts-speed-btn ${tts.rate === s ? 'active' : ''}`}
                  onClick={() => tts.setRate(s)}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Voice selection (browser engine only) */}
            {tts.engine === 'browser' && sortedVoices.length > 0 && (
              <div className="tts-voice-row">
                <span className="tts-speed-label">Voice</span>
                <select
                  className="tts-voice-select"
                  value={tts.selectedVoiceURI}
                  onChange={e => tts.setVoice(e.target.value)}
                >
                  <option value="">Auto (best)</option>
                  {sortedVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {voiceLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Progress bar */}
            {tts.totalSentences > 0 && (
              <div>
                <div className="tts-progress-bar">
                  <div
                    className="tts-progress-fill"
                    style={{ width: `${(tts.currentSentence / tts.totalSentences) * 100}%` }}
                  />
                </div>
                <div className="tts-progress-text">
                  Sentence {tts.currentSentence} / {tts.totalSentences}
                </div>
              </div>
            )}

            {/* Current sentence context */}
            {tts.status !== 'idle' && allSentences.length > 0 && (
              <div className="tts-current-text">
                {allSentences.slice(ctxStart, ctxEnd).map((s, i) => {
                  const idx = ctxStart + i
                  const isCurrent = idx === tts.currentSentence - 1
                  return (
                    <p key={i} className={isCurrent ? 'tts-sentence-active' : 'tts-sentence-context'}>
                      {s}
                    </p>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )

  if (poppedOut) {
    return (
      <div className="summary-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onTogglePopup?.() }}>
        <div className="summary-panel-popup">
          <div className="summary-panel">
            {panelContent}
          </div>
        </div>
      </div>
    )
  }

  return <div className="summary-panel">{panelContent}</div>
}
