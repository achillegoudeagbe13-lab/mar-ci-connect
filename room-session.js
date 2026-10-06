export function buildRoomSession(roomId, hostId = null) {
  const now = new Date().toISOString()
  const initialParticipants = hostId ? [{ id: hostId, name: 'Host', isHost: true }] : []

  return {
    roomId,
    hostId,
    status: 'active',
    participants: initialParticipants,
    users: new Map(initialParticipants.map((participant) => [participant.id, participant])),
    logs: [],
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeParticipant(participant) {
  if (!participant || typeof participant.id !== 'string' || !participant.id.trim()) {
    throw new Error('Participant must include a valid id.')
  }

  return {
    id: participant.id,
    name: participant.name || `Participant ${participant.id.slice(0, 4)}`,
    isHost: Boolean(participant.isHost),
  }
}

export function addParticipantToSession(room, participant) {
  if (!room) return null

  const normalized = normalizeParticipant(participant)
  const existingIndex = room.participants.findIndex((item) => item.id === normalized.id)

  if (existingIndex >= 0) {
    room.participants.splice(existingIndex, 1, normalized)
  } else {
    room.participants.push(normalized)
  }

  room.users = room.users || new Map()
  room.users.set(normalized.id, normalized)

  if (room.hostId === null || room.hostId === undefined) {
    room.hostId = room.participants[0]?.id || null
  }

  room.participants = room.participants.map((item) => ({
    ...item,
    isHost: item.id === room.hostId,
  }))

  room.status = room.participants.length > 0 ? 'active' : 'empty'
  room.updatedAt = new Date().toISOString()

  return room
}

export function removeParticipantFromSession(room, participantId) {
  if (!room) return null

  room.participants = room.participants.filter((item) => item.id !== participantId)
  room.users = room.users || new Map()
  room.users.delete(participantId)

  if (room.hostId === participantId) {
    room.hostId = room.participants[0]?.id || null
  }

  room.participants = room.participants.map((item) => ({
    ...item,
    isHost: item.id === room.hostId,
  }))

  room.status = room.participants.length > 0 ? 'active' : 'empty'
  room.updatedAt = new Date().toISOString()

  return room
}

export function appendRoomLog(room, event, payload = {}) {
  if (!room) return room

  const entry = {
    event,
    at: new Date().toISOString(),
    ...payload,
  }

  room.logs = [...(room.logs || []), entry].slice(-50)
  room.updatedAt = entry.at
  return room
}
