/**
 * The last household used (M4 plan, H9): an id only, in `localStorage`.
 * Storage that can't be read or written is ignored: the Household tab then
 * opens the list.
 */
export const HOUSEHOLD_POINTER_KEY = 'settle.household'

export function readHouseholdPointer(): string | null {
  try {
    return window.localStorage.getItem(HOUSEHOLD_POINTER_KEY)
  } catch {
    return null
  }
}

export function writeHouseholdPointer(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(HOUSEHOLD_POINTER_KEY)
    else window.localStorage.setItem(HOUSEHOLD_POINTER_KEY, id)
  } catch {
    // Blocked or full storage: the pointer is a convenience.
  }
}

/**
 * Asks the browser not to evict the ledger under storage pressure (H3),
 * once, from the click that creates the first household. Whatever it
 * answers, the app works the same.
 */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.().catch(() => undefined)
  } catch {
    // Not available here.
  }
}
