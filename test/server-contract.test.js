import test from 'node:test'
import assert from 'node:assert/strict'

const roomPattern = /^[a-zA-Z0-9_-]+$/
const annotationPattern = /^#[0-9a-fA-F]{6}$/

test('room identifiers accept safe URL-friendly values only', () => {
  assert.equal(roomPattern.test('KORA-84M'), true)
  assert.equal(roomPattern.test('team_room_01'), true)
  assert.equal(roomPattern.test('room with spaces'), false)
  assert.equal(roomPattern.test('<script>'), false)
})

test('annotation colors require six-digit hex values', () => {
  assert.equal(annotationPattern.test('#D8F060'), true)
  assert.equal(annotationPattern.test('#fff'), false)
  assert.equal(annotationPattern.test('red'), false)
})

test('room size defaults remain bounded for Render free instances', () => {
  const configured = Number(process.env.MAX_ROOM_PARTICIPANTS || 12)
  assert.ok(Number.isInteger(configured) && configured > 0 && configured <= 100)
})
