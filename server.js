import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import express from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { Server } from 'socket.io'
import { z } from 'zod'

const app = express()
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean)
const renderOrigin = process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '')
const originAllowed = (origin) => !origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || origin === renderOrigin
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: (origin, callback) => callback(null, originAllowed(origin)), methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6,
})
const port = Number(process.env.PORT || 3001)
const roomLimit = Number(process.env.MAX_ROOM_PARTICIPANTS || 12)

app.set('trust proxy', 1)
app.use(helmet({ crossOriginEmbedderPolicy: false }))
app.use(express.json({ limit: '32kb' }))
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }))

const rooms = new Map()

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
  if (!rooms.has(roomId)) rooms.set(roomId, { hostId: null, users: new Map() })
  return rooms.get(roomId)
}

app.get('/health', (_request, response) => response.json({
  ok: true,
  service: 'mar-ci-signal',
  uptime: Math.round(process.uptime()),
  rooms: rooms.size,
  participants: [...rooms.values()].reduce((total, room) => total + room.users.size, 0),
}))

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

  socket.on('join-room', (roomId) => {
    const parsedRoom = roomSchema.safeParse(roomId)
    if (!parsedRoom.success || socket.data.roomId) return socket.emit('server-error', 'Identifiant de salle invalide.')
    roomId = parsedRoom.data
    const state = getRoomState(roomId)
    if (state.users.size >= roomLimit) return socket.emit('server-error', 'Cette salle est pleine.')
    if (!state.hostId) state.hostId = socket.id
    const existingUsers = [...state.users.values()]
    const user = { id: socket.id, name: `Participant ${state.users.size + 1}`, isHost: state.hostId === socket.id }
    state.users.set(socket.id, user)
    socket.join(roomId)
    socket.data.roomId = roomId
    socket.data.isHost = user.isHost
    socket.emit('room-state', { users: existingUsers, hostId: state.hostId })
    socket.to(roomId).emit('user-connected', user)
  })

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
    if (!socket.data.isHost || !state?.users.has(targetId) || !canEmit('moderate', 10)) return
    io.to(targetId).emit('moderation', { action, by: socket.id })
    if (action === 'kick') {
      io.to(targetId).emit('kicked')
      io.sockets.sockets.get(targetId)?.leave(roomId)
      socket.to(roomId).emit('user-disconnected', targetId)
      state.users.delete(targetId)
    }
  })

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId
    const state = roomId && rooms.get(roomId)
    if (roomId) socket.to(roomId).emit('user-disconnected', socket.id)
    if (state) {
      state.users.delete(socket.id)
      if (state.hostId === socket.id) state.hostId = state.users.keys().next().value || null
      if (state.users.size === 0) rooms.delete(roomId)
    }
  })
})

httpServer.listen(port, () => console.log(`MAR-CI signal server listening on http://localhost:${port}`))
