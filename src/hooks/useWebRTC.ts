import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

type SignalDescription = RTCSessionDescriptionInit | RTCIceCandidateInit

type SignalMessage = {
  from: string
  signal: SignalDescription
}

type RemoteStream = {
  id: string
  stream: MediaStream
}

export type RoomParticipant = { id: string; name: string; isHost: boolean }
export type LiveReaction = { id: string; senderId: string; emoji: string }
export type LiveMessage = { id: string; senderId: string; text: string; code?: string | null; language?: string | null }
export type AnnotationPoint = { x: number; y: number }
export type AnnotationStroke = { id: string; tool: 'pen' | 'highlighter' | 'rectangle' | 'arrow'; color: string; width: number; points: AnnotationPoint[] }
export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'offline'
export type MediaDeviceOption = { deviceId: string; label: string }

const configuredIceServers = import.meta.env.VITE_ICE_SERVERS
const rtcConfig: RTCConfiguration = {
  iceServers: configuredIceServers
    ? configuredIceServers.split(',').map((urls: string) => ({ urls: urls.trim() }))
    : [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
}

const signalServerUrl = import.meta.env.VITE_SIGNAL_SERVER_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001')

export function useWebRTC(roomId: string | null) {
  const socketRef = useRef<Socket | null>(null)
  const peersRef = useRef(new Map<string, RTCPeerConnection>())
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([])
  const [isSharing, setIsSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [raisedHands, setRaisedHands] = useState<string[]>([])
  const [reactions, setReactions] = useState<LiveReaction[]>([])
  const [messages, setMessages] = useState<LiveMessage[]>([])
  const [isHost, setIsHost] = useState(false)
  const [selfId, setSelfId] = useState('')
  const [annotations, setAnnotations] = useState<AnnotationStroke[]>([])
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('offline')
  const [videoDevices, setVideoDevices] = useState<MediaDeviceOption[]>([])
  const [audioDevices, setAudioDevices] = useState<MediaDeviceOption[]>([])

  const removePeer = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close()
    peersRef.current.delete(peerId)
    setRemoteStreams((streams) => streams.filter((item) => item.id !== peerId))
  }, [])

  const sendSignal = useCallback((peerId: string, signal: SignalDescription) => {
    socketRef.current?.emit('signal', { to: peerId, signal })
  }, [])

  const createPeer = useCallback(async (peerId: string, initiator: boolean) => {
    if (!localStreamRef.current || peersRef.current.has(peerId)) return

    const peer = new RTCPeerConnection(rtcConfig)
    peersRef.current.set(peerId, peer)
    localStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current!))

    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal(peerId, event.candidate.toJSON())
    }
    peer.ontrack = (event) => {
      const stream = event.streams[0]
      if (!stream) return
      setRemoteStreams((streams) => {
        const existing = streams.find((item) => item.id === peerId)
        return existing ? streams.map((item) => item.id === peerId ? { ...item, stream } : item) : [...streams, { id: peerId, stream }]
      })
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setConnectionQuality('good')
      if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) removePeer(peerId)
    }

    if (initiator) {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      sendSignal(peerId, offer)
    }
  }, [removePeer, sendSignal])

  useEffect(() => {
    if (!roomId) return
    let cancelled = false
    let joined = false
    const socket = io(signalServerUrl, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 8000 })
    socketRef.current = socket
    const joinRoom = () => {
      if (!joined && socket.connected && localStreamRef.current) {
        joined = true
        socket.emit('join-room', roomId)
      }
    }
    socket.on('connect', () => {
      setSelfId(socket.id || '')
      setConnectionQuality('good')
      joinRoom()
    })

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        cameraStreamRef.current = stream
        localStreamRef.current = stream
        setLocalStream(stream)
        void refreshDevices()
        joinRoom()
      } catch (captureError) {
        setError(captureError instanceof DOMException && captureError.name === 'NotAllowedError'
          ? 'Autorisez la caméra et le micro pour rejoindre la réunion.'
          : 'Impossible d’accéder à vos périphériques audio/vidéo.')
        joinRoom()
      }
    }

    socket.on('room-state', ({ users, hostId }: { users: RoomParticipant[]; hostId: string }) => {
      const currentSocketId = socket.id || ''
      setParticipants([...users, { id: currentSocketId, name: 'Vous', isHost: currentSocketId === hostId }])
      setIsHost(socket.id === hostId)
      users.forEach((user) => void createPeer(user.id, true))
    })
    socket.on('user-connected', (user: RoomParticipant) => {
      setParticipants((current) => [...current.filter((item) => item.id !== user.id), user])
      void createPeer(user.id, false)
    })
    socket.on('signal', async ({ from, signal }: SignalMessage) => {
      let peer = peersRef.current.get(from)
      if (!peer) {
        await createPeer(from, false)
        peer = peersRef.current.get(from)
      }
      if (!peer) return
      if ('type' in signal && signal.type) {
        await peer.setRemoteDescription(signal)
        if (signal.type === 'offer') {
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          sendSignal(from, answer)
        }
      } else if ('candidate' in signal && signal.candidate) {
        await peer.addIceCandidate(signal)
      }
    })
    socket.on('user-disconnected', (peerId: string) => {
      removePeer(peerId)
      setParticipants((current) => current.filter((item) => item.id !== peerId))
      setRaisedHands((current) => current.filter((id) => id !== peerId))
    })
    socket.on('hand-raise', ({ senderId, raised }: { senderId: string; raised: boolean }) => setRaisedHands((current) => raised ? [...new Set([...current, senderId])] : current.filter((id) => id !== senderId)))
    socket.on('reaction', ({ senderId, emoji }: { senderId: string; emoji: string }) => {
      const reaction = { id: `${senderId}-${Date.now()}`, senderId, emoji }
      setReactions((current) => [...current, reaction])
      window.setTimeout(() => setReactions((current) => current.filter((item) => item.id !== reaction.id)), 3000)
    })
    socket.on('chat-message', (message: Omit<LiveMessage, 'id'>) => setMessages((current) => [...current, { ...message, id: `${message.senderId}-${Date.now()}` }]))
    socket.on('annotation', (stroke: AnnotationStroke) => setAnnotations((current) => {
      const existing = current.findIndex((item) => item.id === stroke.id)
      return existing === -1 ? [...current, stroke] : current.map((item, index) => index === existing ? stroke : item)
    }))
    socket.on('annotations-cleared', () => setAnnotations([]))
    socket.on('moderation', ({ action }: { action: 'mute' | 'camera-off' }) => {
      if (action === 'mute') localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false })
      if (action === 'camera-off') localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = false })
    })
    socket.on('kicked', () => {
      setError('Vous avez été expulsé de cette réunion par l’hôte.')
      socket.disconnect()
    })
    socket.on('disconnect', () => setConnectionQuality('offline'))
    socket.on('connect_error', () => {
      setConnectionQuality('offline')
      setError('Serveur de signalement indisponible. Nouvelle tentative en cours...')
    })
    socket.on('server-error', (message: string) => setError(message))

    void start()
    return () => {
      cancelled = true
      socket.disconnect()
      peersRef.current.forEach((peer) => peer.close())
      peersRef.current.clear()
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
      localStreamRef.current = null
      setLocalStream(null)
      setRemoteStreams([])
      setIsSharing(false)
      setParticipants([])
      setRaisedHands([])
      setReactions([])
      setMessages([])
      setIsHost(false)
      setSelfId('')
      setAnnotations([])
      setConnectionQuality('offline')
      socketRef.current = null
    }
  }, [createPeer, removePeer, roomId, sendSignal])

  const toggleTrack = useCallback((kind: 'audio' | 'video') => {
    const track = localStreamRef.current?.getTracks().find((item) => item.kind === kind)
    if (!track) return false
    track.enabled = !track.enabled
    return track.enabled
  }, [])

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const devices = await navigator.mediaDevices.enumerateDevices()
    setVideoDevices(devices.filter((device) => device.kind === 'videoinput').map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Caméra ${index + 1}` })))
    setAudioDevices(devices.filter((device) => device.kind === 'audioinput').map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Micro ${index + 1}` })))
  }, [])

  const selectDevice = useCallback(async (kind: 'audio' | 'video', deviceId: string) => {
    if (!localStreamRef.current) return false
    try {
      const replacement = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video: { deviceId: { exact: deviceId } }, audio: false } : { video: false, audio: { deviceId: { exact: deviceId } } })
      const newTrack = replacement.getTracks()[0]
      const oldTrack = localStreamRef.current.getTracks().find((track) => track.kind === kind)
      if (!newTrack || !oldTrack) return false
      peersRef.current.forEach((peer) => peer.getSenders().find((sender) => sender.track?.kind === kind)?.replaceTrack(newTrack))
      oldTrack.stop()
      const nextStream = new MediaStream([...localStreamRef.current.getTracks().filter((track) => track !== oldTrack), newTrack])
      localStreamRef.current = nextStream
      if (kind === 'video') cameraStreamRef.current = nextStream
      setLocalStream(nextStream)
      await refreshDevices()
      return true
    } catch {
      return false
    }
  }, [refreshDevices])

  const raiseHand = useCallback((raised: boolean) => {
    socketRef.current?.emit('hand-raise', { raised })
    setRaisedHands((current) => raised ? [...new Set([...current, socketRef.current?.id || 'local'])] : current.filter((id) => id !== socketRef.current?.id && id !== 'local'))
  }, [])

  const sendReaction = useCallback((emoji: string) => socketRef.current?.emit('reaction', { emoji }), [])
  const sendChatMessage = useCallback((text: string, code?: string, language = 'text') => socketRef.current?.emit('chat-message', { text, code, language }), [])
  const moderate = useCallback((targetId: string, action: 'mute' | 'camera-off' | 'kick') => socketRef.current?.emit('moderate', { targetId, action }), [])
  const sendAnnotation = useCallback((stroke: AnnotationStroke) => socketRef.current?.emit('annotation', stroke), [])
  const clearAnnotations = useCallback(() => {
    setAnnotations([])
    socketRef.current?.emit('clear-annotations')
  }, [])

  const toggleScreenShare = useCallback(async () => {
    if (!cameraStreamRef.current || !localStreamRef.current) return false
    if (isSharing) {
      const cameraTrack = cameraStreamRef.current.getVideoTracks()[0]
      const screenTrack = localStreamRef.current.getVideoTracks()[0]
      peersRef.current.forEach((peer) => peer.getSenders().find((sender) => sender.track?.kind === 'video')?.replaceTrack(cameraTrack))
      screenTrack?.stop()
      const restored = new MediaStream([...localStreamRef.current.getAudioTracks(), cameraTrack])
      localStreamRef.current = restored
      setLocalStream(restored)
      setIsSharing(false)
      return false
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const screenTrack = screenStream.getVideoTracks()[0]
      peersRef.current.forEach((peer) => peer.getSenders().find((sender) => sender.track?.kind === 'video')?.replaceTrack(screenTrack))
      const shared = new MediaStream([...localStreamRef.current.getAudioTracks(), screenTrack])
      localStreamRef.current = shared
      setLocalStream(shared)
      setIsSharing(true)
      screenTrack.onended = () => void toggleScreenShare()
      return true
    } catch {
      return false
    }
  }, [isSharing])

  return { localStream, remoteStreams, isSharing, error, participants, raisedHands, reactions, messages, isHost, selfId, annotations, connectionQuality, videoDevices, audioDevices, toggleTrack, toggleScreenShare, raiseHand, sendReaction, sendChatMessage, moderate, sendAnnotation, clearAnnotations, refreshDevices, selectDevice }
}
