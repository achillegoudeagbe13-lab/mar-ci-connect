import { useCallback, useEffect, useRef, useState } from 'react'

type RemoteAudio = { stream: MediaStream }

export function useSessionRecorder(localStream: MediaStream | null, remoteStreams: RemoteAudio[]) {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }, [])

  const togglePause = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return false
    if (recorder.state === 'recording') {
      recorder.pause()
      setIsPaused(true)
    } else if (recorder.state === 'paused') {
      recorder.resume()
      setIsPaused(false)
    }
    return recorder.state === 'paused'
  }, [])

  const start = useCallback(() => {
    if (!localStream || isRecording) return false
    if (!window.MediaRecorder) {
      setError('MediaRecorder n’est pas disponible dans ce navigateur.')
      return false
    }
    try {
      const audioContext = new AudioContext()
      const destination = audioContext.createMediaStreamDestination()
      audioContextRef.current = audioContext
      destinationRef.current = destination
      const audioStreams = [localStream, ...remoteStreams.map((item) => item.stream)]
      audioStreams.forEach((stream) => {
        if (stream.getAudioTracks().length) audioContext.createMediaStreamSource(stream).connect(destination)
      })
      const videoTrack = localStream.getVideoTracks()[0]
      const mixedStream = new MediaStream([...(videoTrack ? [videoTrack] : []), ...destination.stream.getAudioTracks()])
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(mixedStream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = () => setError('Impossible d’enregistrer cette session.')
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `mar-ci-connect-${new Date().toISOString().slice(0, 10)}.webm`
        link.click()
        URL.revokeObjectURL(url)
        audioContext.close()
        audioContextRef.current = null
        destinationRef.current = null
        recorderRef.current = null
        setIsRecording(false)
        setIsPaused(false)
        setElapsed(0)
      }
      recorder.start(1000)
      recorderRef.current = recorder
      setIsRecording(true)
      setElapsed(0)
      setError(null)
      return true
    } catch {
      setError('L’enregistrement nécessite un flux média actif et un navigateur compatible.')
      return false
    }
  }, [isRecording, localStream, remoteStreams])

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isRecording])

  useEffect(() => stop, [stop])

  return { isRecording, isPaused, elapsed, error, start, stop, togglePause, formattedTime: formatDuration(elapsed) }
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}
