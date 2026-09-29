// @vitest-environment node
/**
 * R17: the user's real receipts are never committed. These checks run on
 * this repository (locally, and in CI with its full history), and each is
 * shown able to fail on a throwaway repository.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  LOCAL_FIXTURES,
  ShallowRepositoryError,
  commitsTouching,
  isIgnored,
  repositoryRoot,
  trackedPaths,
} from './localFixtures.node.ts'

const root = repositoryRoot(process.cwd())

describe('the local real-receipt fixtures (R17), in this repository', () => {
  it('are git-ignored', () => {
    expect(isIgnored(root, `${LOCAL_FIXTURES}lidl1.png`)).toBe(true)
    expect(isIgnored(root, `${LOCAL_FIXTURES}lidl1.expected.json`)).toBe(true)
  })

  it('are never tracked or staged', () => {
    expect(trackedPaths(root)).toEqual([])
  })

  it('are in no commit of the history', () => {
    // A failure here means a real receipt is in a commit: see
    // app/README.md, "Local real-receipt fixtures", for what to do.
    expect(commitsTouching(root)).toEqual([])
  })
})

describe('the checks can fail (a throwaway repository)', () => {
  let scratch = ''
  let repo = ''
  const git = (dir: string, ...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  const receipt = `${LOCAL_FIXTURES}receipt.png`

  beforeAll(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'settle-r17-'))
    repo = path.join(scratch, 'repo')
    await mkdir(path.join(repo, LOCAL_FIXTURES), { recursive: true })
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@example.invalid')
    git(repo, 'config', 'user.name', 'Test')
    git(repo, 'config', 'commit.gpgsign', 'false')
    await writeFile(
      path.join(repo, 'app/.gitignore'),
      'src/features/receipt/fixtures/local/\n',
    )
    await writeFile(path.join(repo, receipt), 'not really a receipt')
    git(repo, 'add', 'app/.gitignore')
    git(repo, 'commit', '-q', '-m', 'start')
  })

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true })
  })

  it('reports a file force-added past the ignore rule', () => {
    expect(isIgnored(repo, receipt)).toBe(true)
    expect(trackedPaths(repo)).toEqual([])
    git(repo, 'add', '-f', receipt)
    expect(trackedPaths(repo)).toEqual([receipt])
  })

  it('reports a file committed, then deleted, in the history only', () => {
    git(repo, 'commit', '-q', '-m', 'oops')
    const oops = git(repo, 'rev-parse', 'HEAD')
    git(repo, 'rm', '-q', '--cached', receipt)
    git(repo, 'commit', '-q', '-m', 'remove it')
    expect(trackedPaths(repo)).toEqual([])
    expect(commitsTouching(repo)).toEqual([
      git(repo, 'rev-parse', 'HEAD'),
      oops,
    ])
  })

  it('refuses to pass on a shallow clone', () => {
    const shallow = path.join(scratch, 'shallow')
    git(scratch, 'clone', '-q', '--depth', '1', `file://${repo}`, shallow)
    expect(git(shallow, 'rev-parse', '--is-shallow-repository')).toBe('true')
    expect(() => commitsTouching(shallow)).toThrow(ShallowRepositoryError)
    expect(() => commitsTouching(shallow)).toThrow(/git fetch --unshallow/)
  })
})
