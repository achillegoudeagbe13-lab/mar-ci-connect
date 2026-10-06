export function readNewSpeechResults(results, resultIndex, processedResultCount) {
  const finalTexts = []
  let interimText = null
  let nextProcessedResultCount = processedResultCount

  for (let index = Math.max(0, resultIndex, processedResultCount); index < results.length; index += 1) {
    const result = results[index]
    const text = result?.[0]?.transcript?.trim()
    if (!text) continue

    if (result.isFinal) {
      finalTexts.push(text)
      nextProcessedResultCount = index + 1
    } else {
      interimText = text
    }
  }

  return { finalTexts, interimText, processedResultCount: nextProcessedResultCount }
}