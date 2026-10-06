import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { Server } from 'socket.io'
import { z } from 'zod'
import { addParticipantToSession, appendRoomLog, removeParticipantFromSession } from './room-session.js'
import { createRoomStore } from './room-store.js'
import { createAuditEvent, createRoomRecord, createSessionRecord, createTranscriptRecord, createUserRecord } from './persistence.js'
import { buildAllowedOrigins, buildSecurityHeaders, isOriginAllowed, requireApiToken, sanitizeHeaders } from './security.js'

const app = express()
const allowedOrigins = buildAllowedOrigins(process.env.CLIENT_ORIGIN || 'http://localhost:5173')
const renderOrigin = process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '')
const originAllowed = (origin) => isOriginAllowed(origin, allowedOrigins, renderOrigin)
const httpServer = createServer(app)
const auditTrail = []
const logger = {
  info: (...args) => console.log('[marci][info]', ...args),
  warn: (...args) => console.warn('[marci][warn]', ...args),
  error: (...args) => console.error('[marci][error]', ...args),
}
const io = new Server(httpServer, {
  cors: { origin: (origin, callback) => callback(null, originAllowed(origin)), methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6,
})
const port = Number(process.env.PORT || 3001)
const roomLimit = Number(process.env.MAX_ROOM_PARTICIPANTS || 12)
const rooms = createRoomStore({ ttlMs: Number(process.env.ROOM_TTL_MS || 30 * 60 * 1000) })
const roomLogs = new Map()

app.set('trust proxy', 1)
app.use((request, response, next) => {
  const headers = sanitizeHeaders(request.headers)
  response.set(buildSecurityHeaders({
    'X-Forwarded-For': headers['x-forwarded-for'] || request.ip || 'unknown',
    'X-Request-Id': `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  }))
  next()
})
app.use(helmet({ crossOriginEmbedderPolicy: false }))
app.use(express.json({ limit: '32kb' }))
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use((request, response, next) => {
  if (request.path.startsWith('/api') && !requireApiToken(request)) {
    return response.status(401).json({ ok: false, error: 'Unauthorized' })
  }
  return next()
})

const roomSchema = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/)
const signalSchema = z.object({ to: z.string().min(1).max(100), signal: z.record(z.string(), z.unknown()) }).strict()
const chatSchema = z.object({ text: z.string().trim().min(1).max(4000), code: z.string().max(12000).nullable().optional(), language: z.string().max(32).nullable().optional() }).strict()
const moderationSchema = z.object({ targetId: z.string().min(1).max(100), action: z.enum(['mute', 'camera-off', 'kick']) }).strict()
const annotationSchema = z.object({
  id: z.string().min(1).max(120),
  tool: z.enum(['pen', 'highlighter', 'rectangle', 'arrow']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().finite().min(1).max(40),
  points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict()).min(1).max(2000),
}).strict()

const distPath = join(process.cwd(), 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
}

function getRoomState(roomId) {
  const room = rooms.getOrCreate(roomId)
  roomLogs.set(roomId, room.logs)
  return room
}

function logRoomEvent(roomId, event, payload = {}) {
  if (!roomId) return
  const room = rooms.get(roomId)
  if (!room) return
  appendRoomLog(room, event, payload)
  roomLogs.set(roomId, room.logs)
}

app.get('/health', (_request, response) => {
  const stats = rooms.snapshotStats ? rooms.snapshotStats() : {
    rooms: rooms.size,
    participants: rooms.list ? rooms.list().reduce((total, room) => total + room.participants.length, 0) : 0,
    ttlMs: Number(process.env.ROOM_TTL_MS || 30 * 60 * 1000),
    expiredRooms: 0,
  }

  return response.json({
    ok: true,
    service: 'mar-ci-signal',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    rooms: stats.rooms,
    participants: stats.participants,
    ttlMs: stats.ttlMs,
    expiredRooms: stats.expiredRooms,
    memory: process.memoryUsage(),
    auditTrail: auditTrail.slice(-10),
  })
})

app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'mar-ci-signal', status: 'ready' }))

app.post('/api/records', (request, response) => {
  const { type, roomId, userId, payload } = request.body || {}
  if (!type) return response.status(400).json({ ok: false, error: 'Type de record requis.' })

  const record = createAuditEvent({ type, roomId, userId, payload })
  auditTrail.push(record)
  logger.info('audit-event', type)
  return response.status(201).json({ ok: true, record })
})

app.post('/api/room-records', (request, response) => {
  const { roomId, hostId, userId, status, markdown, text, speakerName, language } = request.body || {}
  if (!roomId) return response.status(400).json({ ok: false, error: 'roomId requis.' })

  const record = {
    room: createRoomRecord({ roomId, hostId, status }),
    session: createSessionRecord({ roomId, userId, hostId, status }),
    transcript: createTranscriptRecord({ roomId, userId, markdown, text, speakerName, language }),
    user: userId ? createUserRecord({ id: userId, email: `${userId}@marci.local`, role: hostId ? 'host' : 'member' }) : null,
  }

  auditTrail.push(createAuditEvent({ type: 'room-record-written', roomId, userId, payload: { roomId, session: true } }))
  return response.status(201).json({ ok: true, record })
})

if (existsSync(distPath)) {
  app.get(/^(?!\/health$|\/socket\.io).*/, (_request, response) => response.sendFile(join(distPath, 'index.html')))
}

io.on('connection', (socket) => {
  const eventTimes = new Map()
  const canEmit = (event, limit = 30) => {
    const now = Date.now()
    const recent = (eventTimes.get(event) || []).filter((time) => now - time < 10_000)
    if (recent.length >= limit) return false
    recent.push(now)
    eventTimes.set(event, recent)
    return true
  }

  const leaveRoom = () => {
    const currentRoomId = socket.data.roomId
    if (!currentRoomId) return

    const state = rooms.get(currentRoomId)
    if (state) {
      const removedUser = removeParticipantFromSession(state, socket.id)
      if (removedUser) {
        logRoomEvent(currentRoomId, 'participant-left', { userId: socket.id, reason: 'leave-room', hostId: state.hostId })
      }
      auditTrail.push(createAuditEvent({ type: 'participant-left', roomId: currentRoomId, userId: socket.id, payload: { reason: 'leave-room' } }))
      socket.to(currentRoomId).emit('user-disconnected', socket.id)
      if (state.participants.length === 0) {
        rooms.delete(currentRoomId)
        roomLogs.delete(currentRoomId)
      }
    }

    socket.leave(currentRoomId)
    socket.data.roomId = null
    socket.data.isHost = false
  }

  socket.on('join-room', (roomId) => {
    const parsedRoom = roomSchema.safeParse(roomId)
    if (!parsedRoom.success) return socket.emit('server-error', 'Identifiant de salle invalide.')
    if (socket.data.roomId) return socket.emit('server-error', 'Vous êtes déjà dans une salle.')

    roomId = parsedRoom.data
    const state = getRoomState(roomId)
    if (state.participants.length >= roomLimit) return socket.emit('server-error', 'Cette salle est pleine.')

    if (!state.hostId) state.hostId = socket.id

    const user = { id: socket.id, name: `Participant ${state.participants.length + 1}`, isHost: state.hostId === socket.id }
    addParticipantToSession(state, user)

    socket.join(roomId)
    socket.data.roomId = roomId
    socket.data.isHost = user.isHost
    auditTrail.push(createAuditEvent({ type: 'join-room', roomId, userId: socket.id, payload: { hostId: state.hostId } }))

    logRoomEvent(roomId, 'join-room', { userId: socket.id, name: user.name, hostId: state.hostId })
    socket.emit('room-state', { users: state.participants, hostId: state.hostId, roomStatus: state.status })
    socket.to(roomId).emit('user-connected', user)
  })

  socket.on('leave-room', leaveRoom)

  socket.on('signal', (payload) => {
    const parsed = signalSchema.safeParse(payload)
    const roomId = socket.data.roomId
    const state = roomId && rooms.get(roomId)
    if (parsed.success && state?.users.has(parsed.data.to) && canEmit('signal', 100)) io.to(parsed.data.to).emit('signal', { from: socket.id, signal: parsed.data.signal })
  })

  const relayToRoom = (event, payload) => {
    const roomId = socket.data.roomId
    if (roomId) io.to(roomId).emit(event, { ...payload, senderId: socket.id })
  }

  socket.on('hand-raise', ({ raised }) => { if (socket.data.roomId && canEmit('hand-raise')) relayToRoom('hand-raise', { raised: Boolean(raised) }) })
  socket.on('reaction', ({ emoji }) => {
    if (typeof emoji === 'string' && emoji.length <= 4 && canEmit('reaction', 15)) relayToRoom('reaction', { emoji })
  })
  socket.on('chat-message', (payload) => {
    const parsed = chatSchema.safeParse(payload)
    if (parsed.success && socket.data.roomId && canEmit('chat-message', 20)) relayToRoom('chat-message', parsed.data)
  })
  socket.on('annotation', (stroke) => {
    const parsed = annotationSchema.safeParse(stroke)
    if (parsed.success && socket.data.roomId && canEmit('annotation', 120)) relayToRoom('annotation', parsed.data)
  })
  socket.on('clear-annotations', () => {
    const roomId = socket.data.roomId
    if (roomId && canEmit('clear-annotations', 3)) io.to(roomId).emit('annotations-cleared')
  })

  socket.on('moderate', (payload) => {
    const parsed = moderationSchema.safeParse(payload)
    if (!parsed.success) return
    const { targetId, action } = parsed.data
    const roomId = socket.data.roomId
    const state = roomId && rooms.get(roomId)
    if (!socket.data.isHost || !state?.participants.some((participant) => participant.id === targetId) || !canEmit('moderate', 10)) return
    io.to(targetId).emit('moderation', { action, by: socket.id })
    if (action === 'kick') {
      io.to(targetId).emit('kicked')
      const targetSocket = io.sockets.sockets.get(targetId)
      if (targetSocket) {
        targetSocket.leave(roomId)
        targetSocket.data.roomId = null
        targetSocket.data.isHost = false
      }
      socket.to(roomId).emit('user-disconnected', targetId)
      removeParticipantFromSession(state, targetId)
      auditTrail.push(createAuditEvent({ type: 'moderation-kick', roomId, userId: socket.id, payload: { targetId } }))
      logRoomEvent(roomId, 'moderation-kick', { targetId, by: socket.id, hostId: state.hostId })
      if (state.participants.length === 0) {
        rooms.delete(roomId)
        roomLogs.delete(roomId)
      }
    }
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId
    const state = roomId && rooms.get(roomId)
    if (roomId) socket.to(roomId).emit('user-disconnected', socket.id)
    if (state) {
      removeParticipantFromSession(state, socket.id)
      logRoomEvent(roomId, 'participant-left', { userId: socket.id, reason: 'disconnect', hostId: state.hostId })
      if (state.participants.length === 0) {
        rooms.delete(roomId)
        roomLogs.delete(roomId)
      }
    }
    socket.data.roomId = null
    socket.data.isHost = false
  })
})

httpServer.listen(port, () => console.log(`MAR-CI signal server listening on http://localhost:${port}`))
