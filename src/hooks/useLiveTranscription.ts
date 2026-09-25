import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionEventLike = Event & { results: { length: number; [index: number]: { isFinal?: boolean; [index: number]: { transcript: string } } } }
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event) => void) | null
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
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setIsSupported(false)
      setError('La transcription vocale n’est pas disponible dans ce navigateur.')
      return
    }
    if (recognitionRef.current) return
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'fr-FR'
    recognition.onresult = (event) => {
      let transcript = ''
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index]?.[0]?.transcript || ''
      if (!transcript.trim()) return
      const interim = event.results[event.results.length - 1]?.isFinal === false
      const entry = { id: `transcript-${Date.now()}`, timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), text: transcript.trim(), interim }
      const nextEntries = [...entriesRef.current.filter((item) => !item.interim), entry]
      entriesRef.current = nextEntries
      setEntries(nextEntries)
      window.parent !== window && window.parent.postMessage({ type: 'marci-transcription', markdown: toMarkdown(nextEntries) }, '*')
    }
    recognition.onerror = () => setError('La transcription a rencontré un problème avec le microphone.')
    recognition.onend = () => {
      recognitionRef.current = null
      setIsListening(false)
      if (enabled) window.setTimeout(() => start(), 250)
    }
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setError(null)
  }, [enabled])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsListening(false)
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
