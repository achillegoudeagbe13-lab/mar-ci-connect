import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRoomSession, addParticipantToSession, removeParticipantFromSession } from '../room-session.js'

test('buildRoomSession creates a room state with status and timestamps', () => {
  const room = buildRoomSession('KORA-84M', 'host-1')

  assert.equal(room.roomId, 'KORA-84M')
  assert.equal(room.hostId, 'host-1')
  assert.equal(room.status, 'active')
  assert.ok(Array.isArray(room.participants))
  assert.equal(room.participants.length, 1)
  assert.equal(room.participants[0].isHost, true)
  assert.ok(room.createdAt)
  assert.ok(room.updatedAt)
})

test('addParticipantToSession adds a participant and reassigns host if needed', () => {
  const room = buildRoomSession('ROOM-1', 'host-1')
  addParticipantToSession(room, { id: 'user-2', name: 'Participant 2', isHost: false })

  assert.equal(room.participants.length, 2)
  assert.equal(room.participants[1].name, 'Participant 2')
  assert.ok(room.updatedAt)
})

test('removeParticipantFromSession removes the participant and reassigns host to the next user', () => {
  const room = buildRoomSession('ROOM-2', 'host-1')
  addParticipantToSession(room, { id: 'user-2', name: 'Participant 2', isHost: false })
  addParticipantToSession(room, { id: 'user-3', name: 'Participant 3', isHost: false })

  removeParticipantFromSession(room, 'host-1')

  assert.equal(room.hostId, 'user-2')
  assert.equal(room.participants.some((participant) => participant.id === 'host-1'), false)
  assert.equal(room.status, 'active')
})
