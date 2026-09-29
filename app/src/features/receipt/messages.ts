/**
 * D16's user-facing messages, one per read error. Each ends by pointing at
 * the manual editor, which is right there.
 */
import type { ReadErrorCode } from './model.ts'

const FALLBACK = 'You can type the items in below.'

const MESSAGES: Record<ReadErrorCode, string> = {
  unsupportedType:
    'This file type can’t be read. Use a JPEG, PNG, HEIC or PDF.',
  tooLarge: 'This file is over 20 MB, too large to read.',
  // R2-O-6: say how to fix it.
  tooManyPixels:
    'This photo is too large to read. Take the photo at normal resolution, or crop it.',
  decodeFailed: 'This file couldn’t be opened.',
  ocrFailed: 'The text on this receipt couldn’t be read.',
  assetsUnavailable:
    'The receipt reader couldn’t load. Check your connection: the first scan downloads it.',
  noItems: 'No items were found on this receipt.',
  cancelled: 'Reading was cancelled.',
}

export function readErrorMessage(code: ReadErrorCode): string {
  return `${MESSAGES[code]} ${FALLBACK}`
}
