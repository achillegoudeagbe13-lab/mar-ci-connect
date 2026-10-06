import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createRoomRecord,
  createSessionRecord,
  createTranscriptRecord,
  createUserRecord,
} from '../persistence.js'
import { buildAllowedOrigins, requireApiToken, sanitizeHeaders } from '../security.js'

test('durable records have the expected fields for rooms, sessions and transcripts', () => {
  const room = createRoomRecord({ roomId: 'ROOM-42', hostId: 'host-1' })
  const session = createSessionRecord({ roomId: 'ROOM-42', userId: 'user-1', status: 'active' })
  const transcript = createTranscriptRecord({ roomId: 'ROOM-42', userId: 'user-1', markdown: '# Hello' })
  const user = createUserRecord({ id: 'user-1', email: 'team@example.com', role: 'admin' })

  assert.equal(room.roomId, 'ROOM-42')
  assert.equal(room.hostId, 'host-1')
  assert.equal(room.status, 'active')
  assert.equal(session.roomId, 'ROOM-42')
  assert.equal(transcript.markdown, '# Hello')
  assert.equal(user.email, 'team@example.com')
})

test('allowed origins and security headers are normalized', () => {
  const origins = buildAllowedOrigins('https://app.example.com,https://admin.example.com')
  assert.deepEqual(origins, ['https://app.example.com', 'https://admin.example.com'])

  const headers = sanitizeHeaders({
    'x-forwarded-for': '127.0.0.1',
    'x-marci-token': 'abc',
    'x-api-key': 'secret',
  })

  assert.equal(headers['x-forwarded-for'], '127.0.0.1')
  assert.equal(headers['x-marci-token'], 'abc')
})

test('requireApiToken accepts valid token or bypasses when unset', () => {
  const envToken = process.env.MARCI_API_TOKEN
  delete process.env.MARCI_API_TOKEN

  const bypass = requireApiToken({ headers: {} })
  assert.equal(bypass, true)

  process.env.MARCI_API_TOKEN = 'secret-token'
  const auth = requireApiToken({ headers: { 'x-marci-token': 'secret-token' } })
  assert.equal(auth, true)

  if (envToken !== undefined) process.env.MARCI_API_TOKEN = envToken
  else delete process.env.MARCI_API_TOKEN
})
