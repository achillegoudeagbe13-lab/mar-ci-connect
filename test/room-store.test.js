import test from 'node:test'
import assert from 'node:assert/strict'
import { createRoomStore } from '../room-store.js'

test('createRoomStore creates and persists room state across lookups', () => {
  const store = createRoomStore()
  const room = store.getOrCreate('ROOM-A')

  room.hostId = 'host-1'
  room.participants = [{ id: 'host-1', name: 'Host', isHost: true }]

  assert.equal(store.get('ROOM-A').hostId, 'host-1')
  assert.equal(store.countParticipants(), 1)
})

test('createRoomStore supports multi-room counting and cleanup', () => {
  const store = createRoomStore()
  store.getOrCreate('ROOM-A')
  store.getOrCreate('ROOM-B')

  store.get('ROOM-A').participants = [{ id: 'a1', name: 'A1', isHost: true }]
  store.get('ROOM-B').participants = [{ id: 'b1', name: 'B1', isHost: true }, { id: 'b2', name: 'B2', isHost: false }]

  assert.equal(store.countParticipants(), 3)
  assert.equal(store.list().length, 2)

  store.delete('ROOM-A')
  assert.equal(store.list().length, 1)
})

test('createRoomStore exposes TTL metrics and prunes expired rooms', async () => {
  const store = createRoomStore({ ttlMs: 20 })
  store.getOrCreate('ROOM-TTL')
  store.get('ROOM-TTL').updatedAt = new Date(Date.now() - 1000).toISOString()

  const before = store.snapshotStats()
  assert.equal(before.rooms, 1)
  assert.equal(before.participants, 0)

  await new Promise((resolve) => setTimeout(resolve, 50))
  store.pruneExpired()
  const after = store.snapshotStats()

  assert.equal(after.rooms, 0)
  assert.equal(after.participants, 0)
})
