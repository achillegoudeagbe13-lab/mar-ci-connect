type SpeechRecognitionResultLike = {
  isFinal?: boolean
  [index: number]: { transcript: string }
}

export function readNewSpeechResults(
  results: { length: number; [index: number]: SpeechRecognitionResultLike },
  resultIndex: number,
  processedResultCount: number,
): { finalTexts: string[]; interimText: string | null; processedResultCount: number }