// @vitest-environment node
/**
 * The literal-text guard (M3 plan, S11, acceptance targets layers 1 and
 * 2): no interface text in `src/` outside the catalogue.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findLiteralText, readsAsLanguage } from '../test/literalText.ts'

const SRC = path.resolve(import.meta.dirname, '..')

/**
 * Left out of the walk, each with its reason. Everything else under
 * `src/` is checked, so a new module is checked without being added here.
 */
const EXCLUDED: readonly [prefix: string, reason: string][] = [
  ['i18n/', 'the catalogue itself'],
  ['test/', 'test helpers, never shipped'],
  [
    'ui/gallery/',
    'the development-only component gallery, never in a production build',
  ],
  [
    'features/receipt/parse/',
    'the receipt parser and its keywords: data read from receipts, not interface text',
  ],
]

/** Allowed literals, each with its reason. */
const ALLOWED = new Map([
  ['Settle', 'the wordmark, a name the same in every language'],
  ['Files', 'a DOM value: the drag type compared in ScanReceipt'],
  [
    'The OCR worker failed',
    'a PaddleFailure detail for developers, never shown',
  ],
  ['VersionError', 'a DOMException name compared in code (data/db.ts)'],
  ['Enter', 'a KeyboardEvent.key name compared in code'],
  ['Escape', 'a KeyboardEvent.key name compared in code'],
  ['ArrowDown', 'a KeyboardEvent.key name compared in code'],
  ['ArrowUp', 'a KeyboardEvent.key name compared in code'],
  ['ArrowLeft', 'a KeyboardEvent.key name compared in code'],
  ['ArrowRight', 'a KeyboardEvent.key name compared in code'],
])

function sourceFiles(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join('/'))
    .filter(
      (file) =>
        /\.tsx?$/.test(file) &&
        !/\.test\.tsx?$/.test(file) &&
        !file.endsWith('.node.ts') &&
        !file.endsWith('.d.ts') &&
        !EXCLUDED.some(([prefix]) => file.startsWith(prefix)),
    )
}

describe('the literal-text guard on src/', () => {
  it('walks the app’s modules, the new ones included', () => {
    const files = sourceFiles()
    expect(files).toContain('pages/SplitPage.tsx')
    expect(files).toContain('features/split/components/fields.ts')
    expect(files).toContain('features/receipt/review.ts')
    expect(files).not.toContain('i18n/en.ts')
    expect(files.length).toBeGreaterThan(60)
  })

  it('finds no interface text outside the catalogue', () => {
    const allowed = new Set(ALLOWED.keys())
    const findings = sourceFiles().flatMap((file) =>
      findLiteralText(
        file,
        readFileSync(path.join(SRC, file), 'utf8'),
        allowed,
      ).map(({ line, kind, text }) => `${file}:${line} [${kind}] ${text}`),
    )
    expect(findings).toEqual([])
  })
})

describe('the guard itself', () => {
  const find = (source: string, file = 'probe.tsx') =>
    findLiteralText(file, source).map(({ kind, text }) => `${kind}: ${text}`)

  it.each([
    [
      'a constant map shown through an expression',
      `const LABELS = { system: 'System' }\nexport const A = () => <p>{LABELS[x]}</p>`,
      ['literal: System'],
    ],
    [
      'a window.confirm prompt',
      `window.confirm('Start a new bill?')`,
      ['literal: Start a new bill?'],
    ],
    [
      'JSX text',
      `export const A = () => <h1>Settings</h1>`,
      ['jsx-text: Settings'],
    ],
    [
      'a label attribute',
      `export const A = () => <ul aria-label="Warnings" />`,
      ['attribute: Warnings'],
    ],
    [
      'a lone lower-case word in a braced label attribute (R1-O2)',
      `export const A = () => <button aria-label={'remove'} />`,
      ['attribute: remove'],
    ],
    [
      'a braced template label attribute (R1-O2)',
      'export const A = () => <img alt={`photo`} />',
      ['attribute: photo'],
    ],
    [
      'a ternary in a label attribute (R2-O1)',
      `export const A = () => <button aria-label={open ? 'close' : 'open'} />`,
      ['attribute: close', 'attribute: open'],
    ],
    [
      'a template with substitutions in a label attribute (R2-O1)',
      'export const A = () => <img alt={`photo of ${name}`} />',
      ['attribute: photo of'],
    ],
    [
      'a parenthesised literal in a label attribute (R2-O1)',
      `export const A = () => <button title={('remove')} />`,
      ['attribute: remove'],
    ],
    [
      'an as literal in a label attribute (R2-O1)',
      `export const A = () => <button title={'remove' as string} />`,
      ['attribute: remove'],
    ],
    [
      'a fallback literal in a label attribute (R2-O1)',
      `export const A = () => <button title={name ?? 'nobody'} />`,
      ['attribute: nobody'],
    ],
    [
      'a literal passed to a kit component’s label prop (R2-O1)',
      `export const A = () => <Bars label="spending" bars={[]} />`,
      ['attribute: spending'],
    ],
    [
      'template text',
      'const s = `Reading the text… ${percent}`',
      ['literal: Reading the text…'],
    ],
    [
      'a region option label',
      `const L = { 'pt-PT': 'Portuguese (Portugal)' }`,
      ['literal: Portuguese (Portugal)'],
    ],
    [
      'a capitalised single word',
      `const a = ['Home', 'Light']`,
      ['literal: Home', 'literal: Light'],
    ],
  ])('rejects %s', (_name, source, expected) => {
    expect(find(source)).toEqual(expected)
  })

  it.each([
    ['an import path', `import x from './Settings.tsx'`],
    ['a className', `export const A = () => <p className="pageActions" />`],
    ['a code comparison', `if (role === 'item' || kind === 'itemDetail') {}`],
    ['a catalogue call', `t('split.newBill')`],
    [
      'a catalogue call as a label attribute',
      `export const A = () => <button aria-label={t('nav.home')} />`,
    ],
    ['codes and keys', `const a = ['pt-PT', 'EUR', '/split', 'settle.bill']`],
    ['a camelCase code', `const a = 'outOfRange'`],
    ['an Error’s text', `throw new RangeError('Not an amount here')`],
    ['an Error subclass', `reject(new DecodeError('Bad file data'))`],
    ['a console call', `console.warn('Something went wrong')`],
    ['a literal type', `type Mode = 'Light mode' | 'Dark'`],
    ['JSX with only punctuation', `export const A = () => <span>⚠ </span>`],
    [
      'a catalogue call inside a label ternary',
      `export const A = () => <b title={on ? t('a.b') : t('c.d')} />`,
    ],
    [
      'an empty or numeric label fallback',
      `export const A = () => <input placeholder={k ? '0' : ''} />`,
    ],
    [
      'a label made only of substitutions',
      'export const A = () => <b title={`${a}: ${b}`} />',
    ],
  ])('accepts %s', (_name, source) => {
    expect(find(source)).toEqual([])
  })

  it('names its limit: a lone lower-case word reads as a code', () => {
    // So layer 3's sentinels list such words ('less', 'were').
    expect(readsAsLanguage('less')).toBe(false)
    expect(readsAsLanguage('were')).toBe(false)
    expect(readsAsLanguage('less than')).toBe(true)
  })

  it('accepts an allowed literal, and only that one', () => {
    expect(
      findLiteralText(
        'a.ts',
        `const a = ['Files', 'Folders']`,
        new Set(['Files']),
      ),
    ).toHaveLength(1)
  })
})
