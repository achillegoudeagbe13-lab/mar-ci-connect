import { buildRoomSession } from './room-session.js'

export class InMemoryRoomStore {
  constructor({ ttlMs = 30 * 60 * 1000 } = {}) {
    this._rooms = new Map()
    this.ttlMs = ttlMs
  }

  has(roomId) {
    return this._rooms.has(roomId)
  }

  get(roomId) {
    return this._rooms.get(roomId) || null
  }

  set(roomId, room) {
    this._rooms.set(roomId, room)
    return this
  }

  delete(roomId) {
    return this._rooms.delete(roomId)
  }

  clear() {
    this._rooms.clear()
  }

  values() {
    return this._rooms.values()
  }

  list() {
    return [...this._rooms.values()]
  }

  get size() {
    return this._rooms.size
  }

  getOrCreate(roomId, hostId = null) {
    if (!this.has(roomId)) {
      const room = buildRoomSession(roomId, hostId)
      this.set(roomId, room)
    }
    return this.get(roomId)
  }

  touch(roomId) {
    const room = this.get(roomId)
    if (!room) return null
    room.updatedAt = new Date().toISOString()
    return room
  }

  countParticipants() {
    return this.list().reduce((total, room) => total + ((room.participants && room.participants.length) || 0), 0)
  }

  snapshotStats() {
    const rooms = this.list()
    return {
      rooms: rooms.length,
      participants: this.countParticipants(),
      ttlMs: this.ttlMs,
      expiredRooms: rooms.filter((room) => this.isExpired(room)).length,
    }
  }

  isExpired(room) {
    if (!room || !room.updatedAt) return false
    const updatedAt = new Date(room.updatedAt).getTime()
    return Number.isFinite(updatedAt) && Date.now() - updatedAt > this.ttlMs
  }

  pruneExpired() {
    const now = Date.now()
    for (const [roomId, room] of this._rooms.entries()) {
      if (!room || !room.updatedAt) continue
      const updatedAt = new Date(room.updatedAt).getTime()
      if (Number.isFinite(updatedAt) && now - updatedAt > this.ttlMs) {
        this._rooms.delete(roomId)
      }
    }
  }
}

export function createRoomStore(options = {}) {
  return new InMemoryRoomStore(options)
}
