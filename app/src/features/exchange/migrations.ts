/**
 * The Settle file's migrations (M6 plan, E3), like the database's (M4,
 * H2): step `i` upgrades a file of version `i + 1` to version `i + 2`, so
 * a file of version n runs every step from n up. The file's version is its
 * own, independent of the database's. Version 1 is the first, so the list
 * is empty.
 */

/** One step: the parsed file of one version, to the next version's shape. */
export type FileMigration = (
  file: Record<string, unknown>,
) => Record<string, unknown>

export const FILE_MIGRATIONS: readonly FileMigration[] = []

/** A step threw: the file is refused. */
export class FileMigrationError extends Error {}

/**
 * Runs every step from `fromVersion` up to the last. The result names the
 * last version (`1 + migrations.length`).
 */
export function migrateFile(
  file: Record<string, unknown>,
  fromVersion: number,
  migrations: readonly FileMigration[] = FILE_MIGRATIONS,
): Record<string, unknown> {
  let current = file
  for (let version = fromVersion; version <= migrations.length; version++) {
    const step = migrations[version - 1]
    if (step === undefined) continue
    try {
      current = { ...step(current), formatVersion: version + 1 }
    } catch (error) {
      throw new FileMigrationError(
        error instanceof Error ? error.message : String(error),
      )
    }
  }
  return current
}
