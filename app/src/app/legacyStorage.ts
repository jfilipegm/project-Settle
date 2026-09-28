import { DRAFT_STORAGE_KEY } from '../features/split/draft.ts'
import { REGION_STORAGE_KEY } from './region.ts'
import { THEME_STORAGE_KEY } from './theme.ts'

/**
 * The storage keys from before the project was renamed to Settle, and the
 * key that replaced each one.
 */
export const LEGACY_STORAGE_KEYS: readonly (readonly [string, string])[] = [
  ['project-w.theme', THEME_STORAGE_KEY],
  ['project-w.region', REGION_STORAGE_KEY],
  ['project-w.bill', DRAFT_STORAGE_KEY],
]

/**
 * Moves each value saved under a legacy key to its new key, once, so the
 * rename keeps a returning user's theme, region and bill. A value already
 * under the new key wins. Storage that can't be read or written is left
 * alone: each reader already falls back to its default.
 */
export function migrateLegacyStorage(): void {
  try {
    const storage = window.localStorage
    for (const [legacyKey, key] of LEGACY_STORAGE_KEYS) {
      const legacy = storage.getItem(legacyKey)
      if (legacy === null) {
        continue
      }
      if (storage.getItem(key) === null) {
        storage.setItem(key, legacy)
      }
      storage.removeItem(legacyKey)
    }
  } catch {
    // Disabled, blocked or full storage: nothing to move.
  }
}
