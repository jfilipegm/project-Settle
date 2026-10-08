/** Joins class names, skipping empty ones. */
export function classes(...names: (string | false | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}
