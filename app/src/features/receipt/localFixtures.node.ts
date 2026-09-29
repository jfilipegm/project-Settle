/**
 * Test support: R17's guard on the local real-receipt fixtures. The user's
 * real receipts carry personal data, so they live only in a git-ignored
 * folder on the user's machine. `.gitignore` stops an ordinary `git add`;
 * these checks detect what it can't stop (a `git add -f`, a file tracked
 * before the rule, one committed and then deleted). They detect; they
 * can't prevent: a check runs after the commit exists.
 */
import { execFileSync } from 'node:child_process'

/** The folder, relative to the repository root. */
export const LOCAL_FIXTURES = 'app/src/features/receipt/fixtures/local/'

export class ShallowRepositoryError extends Error {
  constructor() {
    super(
      'The history check needs a full clone, and this one is shallow: run `git fetch --unshallow`',
    )
  }
}

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
}

function lines(output: string): string[] {
  return output.split('\n').filter((line) => line !== '')
}

/** The repository root containing `dir`. */
export function repositoryRoot(dir: string): string {
  return git(dir, ['rev-parse', '--show-toplevel'])
}

/** Whether `path` (relative to the root) is git-ignored. */
export function isIgnored(repo: string, path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: repo })
    return true
  } catch {
    return false
  }
}

/**
 * Every path under `folder` that is tracked or staged: in the index, or in
 * the tree `HEAD` points to.
 */
export function trackedPaths(repo: string, folder = LOCAL_FIXTURES): string[] {
  const indexed = lines(git(repo, ['ls-files', '--', folder]))
  let committed: string[] = []
  try {
    committed = lines(
      git(repo, ['ls-tree', '-r', '--name-only', 'HEAD', '--', folder]),
    )
  } catch {
    // No commit yet: nothing is in a tree.
  }
  return [...new Set([...indexed, ...committed])].sort()
}

/**
 * Every commit reachable from any ref that touches `folder`, so a file
 * committed and then deleted is still found. A shallow repository sees
 * only the commits it fetched, so there the check refuses to pass.
 */
export function commitsTouching(
  repo: string,
  folder = LOCAL_FIXTURES,
): string[] {
  if (git(repo, ['rev-parse', '--is-shallow-repository']) === 'true') {
    throw new ShallowRepositoryError()
  }
  return lines(git(repo, ['log', '--all', '--format=%H', '--', folder]))
}
