export type MediaConnectionQuality = 'excellent' | 'good' | 'poor' | 'offline'

export type RemoteMediaStream = {
  id: string
  stream: MediaStream
}

export type MediaTransportSnapshot = {
  localStream: MediaStream | null
  remoteStreams: RemoteMediaStream[]
  isSharing: boolean
  connectionQuality: MediaConnectionQuality
}

export function normalizeConnectionQuality(value?: string | null): MediaConnectionQuality {
  switch (value) {
    case 'connected':
    case 'completed':
      return 'excellent'
    case 'connecting':
    case 'new':
      return 'good'
    case 'failed':
    case 'disconnected':
    case 'closed':
      return 'poor'
    default:
      return 'offline'
  }
}

export function createMediaTransportSnapshot(
  localStream: MediaStream | null,
  remoteStreams: RemoteMediaStream[],
  isSharing: boolean,
  connectionQuality: MediaConnectionQuality,
): MediaTransportSnapshot {
  return { localStream, remoteStreams, isSharing, connectionQuality }
}

export function replaceTrackInStream(
  stream: MediaStream | null,
  kind: 'audio' | 'video',
  nextTrack: MediaStreamTrack,
): MediaStream | null {
  if (!stream) return null

  const existingTrack = stream.getTracks().find((track) => track.kind === kind)
  if (!existingTrack) {
    const next = new MediaStream([...stream.getTracks(), nextTrack])
    return next
  }

  existingTrack.stop()
  const updatedTracks = stream.getTracks().filter((track) => track !== existingTrack)
  updatedTracks.push(nextTrack)
  return new MediaStream(updatedTracks)
}

export function mergeRemoteStreams(current: RemoteMediaStream[], peerId: string, stream: MediaStream): RemoteMediaStream[] {
  const existing = current.find((item) => item.id === peerId)
  if (existing) {
    return current.map((item) => (item.id === peerId ? { ...item, stream } : item))
  }
  return [...current, { id: peerId, stream }]
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}
