import { useState, useRef, useCallback, useEffect } from 'react'
import { storageService } from '@/services/storageService'

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

// Split text on sentence-ending punctuation
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?。！？；;])\s*/)
  return parts.map(s => s.trim()).filter(s => s.length > 0)
}

/** Quality-aware voice scoring — higher is better */
function voiceQualityScore(voice: SpeechSynthesisVoice, lang: string): number {
  let score = 0
  const name = voice.name.toLowerCase()
  const voiceLang = voice.lang.toLowerCase()

  // Language match bonus
  const langPrefix = lang === 'zh' ? 'zh' : 'en'
  if (voiceLang.startsWith(langPrefix)) score += 100
  else return -1 // wrong language

  // Quality signals in voice name
  if (name.includes('enhanced')) score += 50
  if (name.includes('natural')) score += 60
  if (name.includes('neural')) score += 70
  if (name.includes('premium')) score += 80
  if (name.includes('wavenet')) score += 65
  if (name.includes('nova') || name.includes('google')) score += 40

  // Prefer local voices (not network/streaming — more responsive)
  if (voice.localService) score += 20

  // Penalize "default" voices (usually lowest quality on macOS/Windows)
  if (name.includes('default') && !name.includes('enhanced')) score -= 10

  // Penalize novelty voices
  if (name.includes('novelty') || name.includes('fun') || name.includes('whisper')) score -= 30

  return score
}

/** Pick the best voice for the given language */
export function pickBestVoice(allVoices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const langPrefix = lang === 'zh' ? 'zh' : 'en'
  const candidates = allVoices.filter(v => v.lang.toLowerCase().startsWith(langPrefix))
  if (candidates.length === 0) return null

  candidates.sort((a, b) => voiceQualityScore(b, lang) - voiceQualityScore(a, lang))
  return candidates[0]
}

export type TTSEngine = 'browser' | 'api'

export interface TTSServerConfig {
  ttsApiUrl: string
  ttsModel: string
  ttsVoice: string
}

interface TTSState {
  status: 'idle' | 'playing' | 'paused'
  rate: number
  currentSentence: number
  totalSentences: number
  voices: SpeechSynthesisVoice[]
  selectedVoiceURI: string
  currentText: string
  engine: TTSEngine
  ttsConfig: TTSServerConfig
  error: string | null
}

interface TTSActions {
  play: (text: string, lang?: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setRate: (rate: number) => void
  setVoice: (uri: string) => void
  setEngine: (engine: TTSEngine) => void
}

// Shared sentence queue for both engines
function useSentenceQueue() {
  const sentencesRef = useRef<string[]>([])
  const currentIdxRef = useRef(0)
  const stoppedRef = useRef(false)
  const [currentSentence, setCurrentSentence] = useState(0)
  const [totalSentences, setTotalSentences] = useState(0)
  const [currentText, setCurrentText] = useState('')

  const startQueue = useCallback((text: string) => {
    const sents = splitSentences(text)
    if (sents.length === 0) return false
    sentencesRef.current = sents
    currentIdxRef.current = 0
    setTotalSentences(sents.length)
    setCurrentSentence(0)
    stoppedRef.current = false
    return true
  }, [])

  const advance = useCallback((idx: number) => {
    currentIdxRef.current = idx
    setCurrentSentence(idx + 1)
    if (idx < sentencesRef.current.length) {
      setCurrentText(sentencesRef.current[idx])
    }
  }, [])

  const finish = useCallback(() => {
    setCurrentSentence(0)
    setTotalSentences(0)
  }, [])

  const reset = useCallback(() => {
    sentencesRef.current = []
    stoppedRef.current = true
    setCurrentSentence(0)
    setTotalSentences(0)
  }, [])

  return {
    sentencesRef, currentIdxRef, stoppedRef,
    currentSentence, totalSentences, currentText,
    startQueue, advance, finish, reset,
  }
}

export function useTextToSpeech(): TTSState & TTSActions {
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused'>('idle')
  const [rate, setRate] = useState(() => storageService.getTTSPreferences().rate)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => storageService.getTTSPreferences().voiceURI)
  const [engine, setEngineState] = useState<TTSEngine>(() => (storageService.getTTSPreferences() as any).engine || 'browser')
  const [ttsConfig, setTtsConfig] = useState<TTSServerConfig>({ ttsApiUrl: '', ttsModel: '', ttsVoice: '' })
  const [error, setError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const pendingAbortRef = useRef<AbortController | null>(null)

  const queue = useSentenceQueue()

  // Save local preferences (rate, voiceURI, engine — not TTS config which lives on server)
  const savePrefs = useCallback((partial: Record<string, any>) => {
    const existing = storageService.getTTSPreferences()
    storageService.saveTTSPreferences({ ...existing, ...partial })
  }, [])

  // Load TTS config from server on mount
  useEffect(() => {
    fetch('/api/ai/config')
      .then(r => r.json())
      .then((cfg: any) => {
        if (cfg.tts) setTtsConfig(cfg.tts)
      })
      .catch(() => {})
  }, [])

  // Load voices
  useEffect(() => {
    const load = () => {
      const allVoices = speechSynthesis.getVoices()
      setVoices(allVoices)
      // Auto-select best voice if none selected
      if (!selectedVoiceURI && allVoices.length > 0) {
        const best = pickBestVoice(allVoices, 'zh') || pickBestVoice(allVoices, 'en')
        if (best) {
          setSelectedVoiceURI(best.voiceURI)
          savePrefs({ voiceURI: best.voiceURI })
        }
      }
    }
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      speechSynthesis.cancel()
      if (pendingAbortRef.current) pendingAbortRef.current.abort()
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [])

  // ========== Browser TTS engine ==========
  const speakSentenceBrowser = useCallback(async (index: number, lang?: string) => {
    if (queue.stoppedRef.current || index >= queue.sentencesRef.current.length) {
      setStatus('idle')
      queue.finish()
      return
    }

    queue.advance(index)

    const sentence = queue.sentencesRef.current[index]

    // Chrome has ~15s limit; split long sentences into chunks
    const chunks: string[] = []
    if (sentence.length > 200) {
      let remaining = sentence
      while (remaining.length > 0) {
        if (remaining.length <= 200) { chunks.push(remaining); break }
        let splitIdx = remaining.lastIndexOf('。', 200)
        if (splitIdx <= 0) splitIdx = remaining.lastIndexOf('，', 200)
        if (splitIdx <= 0) splitIdx = remaining.lastIndexOf('. ', 200)
        if (splitIdx <= 0) splitIdx = remaining.lastIndexOf(',', 200)
        if (splitIdx <= 0) splitIdx = 200
        chunks.push(remaining.slice(0, splitIdx + 1))
        remaining = remaining.slice(splitIdx + 1)
      }
    } else {
      chunks.push(sentence)
    }

    for (let ci = 0; ci < chunks.length; ci++) {
      if (queue.stoppedRef.current) return
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(chunks[ci])
        utterance.rate = rate

        if (selectedVoiceURI) {
          const voice = voices.find(v => v.voiceURI === selectedVoiceURI)
          if (voice) utterance.voice = voice
        }
        if (lang) utterance.lang = lang

        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        speechSynthesis.speak(utterance)
      })
    }

    speakSentenceBrowser(index + 1, lang)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, selectedVoiceURI, voices])

  // ========== External API TTS engine ==========
  const speakSentenceApi = useCallback(async (index: number) => {
    if (queue.stoppedRef.current || index >= queue.sentencesRef.current.length) {
      setStatus('idle')
      queue.finish()
      return
    }

    queue.advance(index)
    const sentence = queue.sentencesRef.current[index]

    // Split long sentences for API calls
    const chunks: string[] = []
    if (sentence.length > 500) {
      let remaining = sentence
      while (remaining.length > 0) {
        if (remaining.length <= 500) { chunks.push(remaining); break }
        let splitIdx = remaining.lastIndexOf('。', 500)
        if (splitIdx <= 0) splitIdx = remaining.lastIndexOf('，', 500)
        if (splitIdx <= 0) splitIdx = remaining.lastIndexOf('. ', 500)
        if (splitIdx <= 0) splitIdx = remaining.lastIndexOf(',', 500)
        if (splitIdx <= 0) splitIdx = 500
        chunks.push(remaining.slice(0, splitIdx + 1))
        remaining = remaining.slice(splitIdx + 1)
      }
    } else {
      chunks.push(sentence)
    }

    for (const chunk of chunks) {
      if (queue.stoppedRef.current) return

      const abort = new AbortController()
      pendingAbortRef.current = abort

      try {
        // Build request body — model/voice injected by server from ttsConfig
        const body: Record<string, any> = { input: chunk, response_format: 'mp3', speed: rate }
        // Let server override if not specified here
        const res = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abort.signal,
        })

        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          let errMsg = `TTS API error: ${res.status}`
          try { const e = JSON.parse(errText); errMsg = e.error || errMsg } catch {}
          throw new Error(errMsg)
        }

        const arrayBuf = await res.arrayBuffer()

        if (queue.stoppedRef.current) return

        // Play audio via AudioContext
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioContext()
        }
        const ctx = audioContextRef.current

        const audioBuffer = await ctx.decodeAudioData(arrayBuf)
        if (queue.stoppedRef.current) return

        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)

        await new Promise<void>((resolve) => {
          source.onended = () => resolve()
          source.start()
        })
      } catch (e: any) {
        if (e.name === 'AbortError' || queue.stoppedRef.current) return
        setError(e.message || 'TTS API request failed')
        setStatus('idle')
        queue.reset()
        return
      }
    }

    speakSentenceApi(index + 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate])

  // ========== Unified play/pause/stop ==========
  const isApiReady = engine === 'api' && ttsConfig.ttsApiUrl

  const play = useCallback((text: string, lang?: string) => {
    speechSynthesis.cancel()
    if (pendingAbortRef.current) pendingAbortRef.current.abort()
    setError(null)

    const ok = queue.startQueue(text)
    if (!ok) return
    setStatus('playing')

    if (isApiReady) {
      speakSentenceApi(0)
    } else {
      speakSentenceBrowser(0, lang)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, isApiReady, queue, speakSentenceBrowser, speakSentenceApi])

  const pause = useCallback(() => {
    if (engine === 'browser') {
      speechSynthesis.pause()
      setStatus('paused')
    }
    // API engine doesn't support pause
  }, [engine])

  const resume = useCallback(() => {
    if (engine === 'browser') {
      speechSynthesis.resume()
      setStatus('playing')
    }
  }, [engine])

  const stop = useCallback(() => {
    queue.stoppedRef.current = true
    speechSynthesis.cancel()
    if (pendingAbortRef.current) pendingAbortRef.current.abort()
    setStatus('idle')
    setError(null)
    queue.reset()
  }, [queue])

  const handleSetRate = useCallback((r: number) => {
    setRate(r)
    savePrefs({ rate: r })
  }, [savePrefs])

  const handleSetVoice = useCallback((uri: string) => {
    setSelectedVoiceURI(uri)
    savePrefs({ voiceURI: uri })
  }, [savePrefs])

  const handleSetEngine = useCallback((e: TTSEngine) => {
    setEngineState(e)
    savePrefs({ engine: e })
  }, [savePrefs])

  return {
    status,
    rate,
    currentSentence: queue.currentSentence,
    totalSentences: queue.totalSentences,
    voices,
    selectedVoiceURI,
    currentText: queue.currentText,
    engine,
    ttsConfig,
    error,
    play,
    pause,
    resume,
    stop,
    setRate: handleSetRate,
    setVoice: handleSetVoice,
    setEngine: handleSetEngine,
  }
}

export { SPEED_OPTIONS, splitSentences }
