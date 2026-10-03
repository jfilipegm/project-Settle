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
  LocalCaseError,
  ShallowRepositoryError,
  countedCases,
  commitsTouching,
  decimalToCents,
  distinctReceipts,
  isIgnored,
  loadLocalCases,
  repositoryRoot,
  selectCases,
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

describe('format v2 of the local fixtures (P1), with invented files', () => {
  let dir = ''
  const valid = {
    image: 'cafe.jpg',
    total: '3.30',
    totalSource: 'qr',
    items: [
      { name: 'Bica', price: '0.80' },
      { name: 'Tosta mista', price: '2.50' },
    ],
    capture: 'camera',
    part: 'tuning',
  }

  /** A fresh folder holding `files` (JSON values are written as JSON). */
  async function folder(files: Record<string, unknown>): Promise<string> {
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    for (const [name, content] of Object.entries(files)) {
      await writeFile(
        path.join(dir, name),
        typeof content === 'string' ? content : JSON.stringify(content),
      )
    }
    return dir
  }

  beforeAll(async () => {
    dir = path.join(await mkdtemp(path.join(tmpdir(), 'settle-v2-')), 'local')
  })

  afterAll(async () => {
    await rm(path.dirname(dir), { recursive: true, force: true })
  })

  it('loads a PDF a store app exported as a case', async () => {
    const cases = await loadLocalCases(
      await folder({
        'lidl.pdf': 'x',
        'lidl.expected.json': { ...valid, image: 'lidl.pdf' },
      }),
    )
    expect(cases.map((entry) => entry.imageType)).toEqual(['pdf'])
  })

  it('loads a case, in cents, with its image type', async () => {
    const cases = await loadLocalCases(
      await folder({ 'cafe.jpg': 'x', 'cafe.expected.json': valid }),
    )
    expect(cases).toEqual([
      {
        name: 'cafe',
        image: 'cafe.jpg',
        imageType: 'jpeg',
        expected: {
          total: 330,
          items: [
            { name: 'Bica', price: 80 },
            { name: 'Tosta mista', price: 250 },
          ],
        },
        totalSource: 'qr',
        capture: 'camera',
        part: 'tuning',
        receipt: 'cafe',
      },
    ])
  })

  it('keeps the optional adjustments and floor', async () => {
    const [entry] = await loadLocalCases(
      await folder({
        'cafe.jpg': 'x',
        'cafe.expected.json': {
          ...valid,
          tip: '0.50',
          tax: '0.10',
          discount: '1',
          minRowAccuracy: 0.5,
        },
      }),
    )
    expect(entry?.expected).toMatchObject({ tip: 50, tax: 10, discount: 100 })
    expect(entry?.minRowAccuracy).toBe(0.5)
  })

  it('is empty when the folder is missing', async () => {
    expect(await loadLocalCases(path.join(dir, 'nowhere'))).toEqual([])
  })

  it.each([
    [
      'a missing image',
      { ...valid, image: 'other.jpg' },
      /image "other.jpg" is missing/,
    ],
    ['a bad amount', { ...valid, total: '3,30' }, /"total" must be a decimal/],
    [
      'a bad item price',
      { ...valid, items: [{ name: 'Bica', price: 0.8 }] },
      /items\[0\]\.price/,
    ],
    [
      'an unnamed item',
      { ...valid, items: [{ price: '0.80' }] },
      /items\[0\] needs a name/,
    ],
    ['no items', { ...valid, items: [] }, /non-empty list/],
    ['a bad total source', { ...valid, totalSource: 'ocr' }, /totalSource/],
    ['a bad capture', { ...valid, capture: 'photo' }, /capture/],
    ['a bad part', { ...valid, part: 'test' }, /"part" must be/],
    [
      'an unknown field',
      { ...valid, qrTotal: '3.30' },
      /unknown field "qrTotal"/,
    ],
    ['an unsupported image', { ...valid, image: 'cafe.gif' }, /isn't JPEG/],
    ['a bad floor', { ...valid, minRowAccuracy: 2 }, /minRowAccuracy/],
    [
      'an unknown sameReceiptAs',
      { ...valid, sameReceiptAs: 'nope' },
      /unknown case "nope"/,
    ],
  ])('fails %s, naming the case', async (_what, content, message) => {
    const files = {
      'cafe.jpg': 'x',
      'cafe.gif': 'x',
      'cafe.expected.json': content,
    }
    const load = loadLocalCases(await folder(files))
    await expect(load).rejects.toThrow(LocalCaseError)
    await expect(loadLocalCases(dir)).rejects.toThrow(/^cafe\.expected\.json: /)
    await expect(loadLocalCases(dir)).rejects.toThrow(message)
  })

  it('fails a file that isn’t JSON', async () => {
    await folder({ 'cafe.jpg': 'x', 'cafe.expected.json': '{ nope' })
    await expect(loadLocalCases(dir)).rejects.toThrow(
      'cafe.expected.json: not valid JSON',
    )
  })

  it('counts two photos of one receipt as one distinct receipt', async () => {
    const cases = await loadLocalCases(
      await folder({
        'cafe.jpg': 'x',
        'cafe.expected.json': valid,
        'cafe2.jpg': 'x',
        'cafe2.expected.json': {
          ...valid,
          image: 'cafe2.jpg',
          sameReceiptAs: 'cafe',
        },
        'cafe3.png': 'x',
        'cafe3.expected.json': {
          ...valid,
          image: 'cafe3.png',
          sameReceiptAs: 'cafe2',
        },
        'shop.heic': 'x',
        'shop.expected.json': { ...valid, image: 'shop.heic' },
      }),
    )
    expect(
      cases.map((entry) => [entry.name, entry.receipt, entry.imageType]),
    ).toEqual([
      ['cafe', 'cafe', 'jpeg'],
      ['cafe2', 'cafe', 'jpeg'],
      ['cafe3', 'cafe', 'png'],
      ['shop', 'shop', 'heic'],
    ])
    expect(distinctReceipts(cases)).toBe(2)
  })

  it('fails a sameReceiptAs loop', async () => {
    await folder({
      'a.jpg': 'x',
      'a.expected.json': { ...valid, image: 'a.jpg', sameReceiptAs: 'b' },
      'b.jpg': 'x',
      'b.expected.json': { ...valid, image: 'b.jpg', sameReceiptAs: 'a' },
    })
    await expect(loadLocalCases(dir)).rejects.toThrow(/loops/)
  })

  it('skips held-out cases unless asked for (P14)', async () => {
    const cases = await loadLocalCases(
      await folder({
        'cafe.jpg': 'x',
        'cafe.expected.json': valid,
        'shop.jpg': 'x',
        'shop.expected.json': { ...valid, image: 'shop.jpg', part: 'heldOut' },
      }),
    )
    const without = selectCases(cases, { heldOut: false })
    expect(without.scored.map((entry) => entry.name)).toEqual(['cafe'])
    expect(without.skipped.map((entry) => entry.name)).toEqual(['shop'])
    const withFlag = selectCases(cases, { heldOut: true })
    expect(withFlag.scored.map((entry) => entry.name)).toEqual(['cafe', 'shop'])
    expect(withFlag.skipped).toEqual([])
  })

  it('keeps `extra` cases out of the counted ones', async () => {
    const cases = await loadLocalCases(
      await folder({
        'cafe.jpg': 'x',
        'cafe.expected.json': valid,
        'web.jpg': 'x',
        'web.expected.json': { ...valid, image: 'web.jpg', part: 'extra' },
      }),
    )
    expect(cases.map((entry) => entry.part)).toEqual(['tuning', 'extra'])
    expect(countedCases(cases).map((entry) => entry.name)).toEqual(['cafe'])
    expect(distinctReceipts(countedCases(cases))).toBe(1)
  })

  it('reads decimal amounts exactly', () => {
    expect(decimalToCents('0.1')).toBe(10)
    expect(decimalToCents('12')).toBe(1200)
    expect(decimalToCents('76.11')).toBe(7611)
    expect(decimalToCents('1.005')).toBeUndefined()
    expect(decimalToCents('-1.00')).toBeUndefined()
    expect(decimalToCents(1.5)).toBeUndefined()
  })
})
