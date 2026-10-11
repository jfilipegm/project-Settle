/**
 * File names for what Settle exports (M6 plan, E1, E11):
 * `Settle - Flat - 2026-10-11.json`, `Settle backup 2026-10-11.json` and
 * `Settle - Flat - 2026-10-11.csv`. Characters a file system refuses are
 * replaced by `-`.
 */

const REFUSED = /[/\\:*?"<>|\p{Cc}]/gu

/** A household name made safe for a file name. */
export function safeName(name: string): string {
  const safe = name.replace(REFUSED, '-').replace(/\s+/g, ' ').trim()
  // A name of dots alone means something else to a file system.
  return /^\.*$/.test(safe) ? '-' : safe.slice(0, 60)
}

/** The day part of a timestamp or date, `YYYY-MM-DD`. */
function day(date: string): string {
  return date.slice(0, 10)
}

const BRAND = 'Settle'

function named(name: string, date: string, extension: string): string {
  return `${[BRAND, '-', safeName(name), '-', day(date)].join(' ')}.${extension}`
}

export function householdFileName(name: string, date: string): string {
  return named(name, date, 'json')
}

/** `word` is the catalogue's "backup", in the app's language. */
export function backupFileName(word: string, date: string): string {
  return `${[BRAND, safeName(word), day(date)].join(' ')}.json`
}

export function csvFileName(name: string, date: string): string {
  return named(name, date, 'csv')
}
