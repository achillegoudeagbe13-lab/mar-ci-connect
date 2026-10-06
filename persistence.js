import { randomUUID } from 'node:crypto'

const nowIso = () => new Date().toISOString()

export function createUserRecord({ id, email, role = 'member', provider = 'local', metadata = {} } = {}) {
  return {
    id: id || randomUUID(),
    email: email || `${randomUUID()}@local.invalid`,
    role,
    provider,
    status: 'active',
    metadata,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

export function createRoomRecord({ roomId, hostId = null, status = 'active', metadata = {} } = {}) {
  return {
    id: randomUUID(),
    roomId,
    hostId,
    status,
    participants: [],
    metadata,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

export function createSessionRecord({ roomId, userId, hostId = null, status = 'active' } = {}) {
  return {
    id: randomUUID(),
    roomId,
    userId,
    hostId,
    status,
    startedAt: nowIso(),
    endedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

export function createTranscriptRecord({ roomId, userId, markdown = '', text = '', speakerName = 'Participant', language = 'fr' } = {}) {
  return {
    id: randomUUID(),
    roomId,
    userId,
    speakerName,
    language,
    markdown,
    text: text || markdown || '',
    createdAt: nowIso(),
  }
}

export function createAuditEvent({ type, roomId = null, userId = null, payload = {} } = {}) {
  return {
    id: randomUUID(),
    type,
    roomId,
    userId,
    payload,
    createdAt: nowIso(),
  }
}
