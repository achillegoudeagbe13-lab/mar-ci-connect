import { useCallback, useEffect, useRef, useState } from 'react'
import { readNewSpeechResults } from '../lib/speech-transcription'

type SpeechRecognitionResultLike = { isFinal?: boolean; [index: number]: { transcript: string } }
type SpeechRecognitionEventLike = Event & { resultIndex: number; results: { length: number; [index: number]: SpeechRecognitionResultLike } }
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event & { error?: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export type TranscriptEntry = { id: string; timestamp: string; text: string; interim?: boolean }

export function useLiveTranscription(enabled: boolean) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const entriesRef = useRef<TranscriptEntry[]>([])
  const processedResultCountRef = useRef(0)
  const enabledRef = useRef(enabled)
  const shouldRestartRef = useRef(true)
  const restartTimerRef = useRef<number | null>(null)
  enabledRef.current = enabled
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(() => {
    if (!enabledRef.current || recognitionRef.current) return
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setIsSupported(false)
      setError('La transcription vocale n’est pas disponible dans ce navigateur.')
      return
    }
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'fr-FR'
    processedResultCountRef.current = 0
    shouldRestartRef.current = true
    recognition.onresult = (event) => {
      const update = readNewSpeechResults(event.results, event.resultIndex, processedResultCountRef.current)
      processedResultCountRef.current = update.processedResultCount
      const timestamp = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      const createEntry = (text: string, interim = false): TranscriptEntry => ({
        id: `transcript-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp,
        text,
        interim,
      })
      const nextEntries = [
        ...entriesRef.current.filter((item) => !item.interim),
        ...update.finalTexts.map((text) => createEntry(text)),
        ...(update.interimText ? [createEntry(update.interimText, true)] : []),
      ]
      entriesRef.current = nextEntries
      setEntries(nextEntries)
      window.parent !== window && window.parent.postMessage({ type: 'marci-transcription', markdown: toMarkdown(nextEntries) }, '*')
    }
    recognition.onerror = (event) => {
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error || '')) {
        shouldRestartRef.current = false
      }
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Autorisez l’accès au microphone dans votre navigateur pour transcrire.'
          : event.error === 'audio-capture'
            ? 'Aucun microphone utilisable n’a été détecté.'
            : 'La transcription a rencontré un problème avec le microphone.')
      }
    }
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return
      recognitionRef.current = null
      setIsListening(false)
      if (enabledRef.current && shouldRestartRef.current) {
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null
          start()
        }, 250)
      }
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setIsListening(true)
      setError(null)
    } catch {
      recognitionRef.current = null
      shouldRestartRef.current = false
      setIsListening(false)
      setError('Impossible de démarrer la transcription. Vérifiez les permissions du microphone.')
    }
  }, [])

  const stop = useCallback(() => {
    shouldRestartRef.current = false
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    const recognition = recognitionRef.current
    recognitionRef.current = null
    setIsListening(false)
    try {
      recognition?.stop()
    } catch {
      return
    }
  }, [])

  useEffect(() => {
    if (enabled) start()
    else stop()
    return stop
  }, [enabled, start, stop])

  return { entries, isListening, isSupported, error, start, stop, markdown: toMarkdown(entries) }
}

export function toMarkdown(entries: TranscriptEntry[]) {
  return entries.filter((entry) => entry.text.trim()).map((entry) => `- [${entry.timestamp}] Vous : ${entry.text}`).join('\n')
}
