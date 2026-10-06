import test from 'node:test'
import assert from 'node:assert/strict'
import { readNewSpeechResults } from '../src/lib/speech-transcription.js'

test('speech results only emit changed results and do not repeat finalized text', () => {
  const first = readNewSpeechResults([
    { 0: { transcript: 'Bonjour' }, isFinal: true },
    { 0: { transcript: 'le mar' }, isFinal: false },
  ], 0, 0)

  assert.deepEqual(first, {
    finalTexts: ['Bonjour'],
    interimText: 'le mar',
    processedResultCount: 1,
  })

  const interimUpdate = readNewSpeechResults([
    { 0: { transcript: 'Bonjour' }, isFinal: true },
    { 0: { transcript: 'le marché' }, isFinal: false },
  ], 1, first.processedResultCount)

  assert.deepEqual(interimUpdate, {
    finalTexts: [],
    interimText: 'le marché',
    processedResultCount: 1,
  })

  const finalized = readNewSpeechResults([
    { 0: { transcript: 'Bonjour' }, isFinal: true },
    { 0: { transcript: 'le marché.' }, isFinal: true },
  ], 1, interimUpdate.processedResultCount)

  assert.deepEqual(finalized, {
    finalTexts: ['le marché.'],
    interimText: null,
    processedResultCount: 2,
  })
})