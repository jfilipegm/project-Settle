/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import { THEME_COLORS } from '../app/theme.ts'

// From disk: Vitest stubs CSS imports, `?raw` included, to an empty string.
const tokensCss = readFileSync(`${import.meta.dirname}/tokens.css`, 'utf8')

/** The declarations inside the first block that opens with `selector {`. */
function block(selector: string): string[] {
  const start = tokensCss.indexOf(`${selector} {`)
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0)
  const open = tokensCss.indexOf('{', start)
  const body = tokensCss
    .slice(open + 1, tokensCss.indexOf('}', open))
    .replace(/\/\*[\s\S]*?\*\//g, '')
  return body
    .split(';')
    .map((declaration) => declaration.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** The palette blocks: light, and the forced dark one (the system dark is checked identical). */
const PALETTES = {
  light: ':root',
  dark: ":root[data-theme='dark']",
} as const

/** The custom properties a block declares, by name. */
function tokens(selector: string): Map<string, string> {
  return new Map(
    block(selector).map((declaration) => {
      const colon = declaration.indexOf(':')
      return [
        declaration.slice(0, colon).trim(),
        declaration.slice(colon + 1).trim(),
      ]
    }),
  )
}

/** A colour token's literal value in a palette. */
function colour(theme: keyof typeof PALETTES, name: string): string {
  const value = tokens(PALETTES[theme]).get(name)
  expect(value, `${name} in ${theme}`).toMatch(/^#[0-9a-f]{6}$/)
  return value ?? ''
}

/** WCAG 2.1 relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.1 contrast ratio between two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/** Themed roles: the colour, person and shadow tokens with a literal value in :root. */
const THEMED = /^--(color|person|shadow)-/

describe('tokens.css', () => {
  it('has the same dark palette for the system and forced dark modes', () => {
    expect(block(":root:not([data-theme='light'])")).toEqual(
      block(":root[data-theme='dark']"),
    )
  })

  it('uses THEME_COLORS as each palette’s --color-card', () => {
    expect(colour('light', '--color-card')).toBe(THEME_COLORS.light)
    expect(colour('dark', '--color-card')).toBe(THEME_COLORS.dark)
  })

  it('defines every themed role in both palettes', () => {
    const light = [...tokens(PALETTES.light)]
      .filter(([name, value]) => THEMED.test(name) && !value.startsWith('var('))
      .map(([name]) => name)
    const dark = [...tokens(PALETTES.dark).keys()].filter((name) =>
      THEMED.test(name),
    )

    expect(light.length).toBeGreaterThanOrEqual(26)
    expect(dark.sort()).toEqual(light.sort())
  })

  it('defines six people colours, each with its initial’s colour', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (let n = 1; n <= 6; n++) {
        colour(theme, `--person-${n}`)
        colour(theme, `--person-on-${n}`)
      }
      expect(tokens(PALETTES[theme]).has('--person-7')).toBe(false)
    }
  })
})

describe('contrast (M3 plan, acceptance targets)', () => {
  const TEXT = [
    '--color-ink',
    '--color-quiet',
    '--color-accent',
    '--color-success',
    '--color-warning',
    '--color-error',
  ]
  const GROUNDS = ['--color-ground', '--color-card']
  const FILLS = [
    ['--color-success', '--color-success-fill'],
    ['--color-warning', '--color-warning-fill'],
    ['--color-error', '--color-error-fill'],
    ['--color-on-ink', '--color-ink'],
  ]

  describe.each(['light', 'dark'] as const)('%s', (theme) => {
    const pair = (fg: string, bg: string) =>
      contrast(colour(theme, fg), colour(theme, bg))

    it.each(TEXT.flatMap((fg) => GROUNDS.map((bg) => [fg, bg])))(
      'text %s on %s is at least 4.5:1',
      (fg, bg) => {
        expect(pair(fg, bg)).toBeGreaterThanOrEqual(4.5)
      },
    )

    it.each(FILLS)('%s on %s is at least 4.5:1', (fg, bg) => {
      expect(pair(fg, bg)).toBeGreaterThanOrEqual(4.5)
    })

    it.each([1, 2, 3, 4, 5, 6])(
      'person %i’s initial is at least 4.5:1 on their colour',
      (n) => {
        expect(
          pair(`--person-on-${n}`, `--person-${n}`),
        ).toBeGreaterThanOrEqual(4.5)
      },
    )

    it.each(
      [1, 2, 3, 4, 5, 6].flatMap((n) => GROUNDS.map((bg) => [n, bg] as const)),
    )(
      'person %i’s colour, a mark such as a share bar, is at least 3:1 on %s',
      (n, bg) => {
        expect(pair(`--person-${n}`, bg)).toBeGreaterThanOrEqual(3)
      },
    )

    it.each(GROUNDS)('the rust focus ring is at least 3:1 on %s', (bg) => {
      expect(pair('--color-accent', bg)).toBeGreaterThanOrEqual(3)
    })
  })

  it('measures known pairs right', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#ffffff')).toBe(1)
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })
})

describe('index.html', () => {
  it('ships one theme-color meta per scheme with THEME_COLORS', () => {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html')
    const metas = [
      ...doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
    ].map((meta) => [meta.getAttribute('media'), meta.content])

    expect(metas).toEqual([
      ['(prefers-color-scheme: light)', THEME_COLORS.light],
      ['(prefers-color-scheme: dark)', THEME_COLORS.dark],
    ])
  })

  it('loads theme-init.js as a blocking classic script after the metas', () => {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html')
    const head = [...doc.head.children]
    const script = head.findIndex(
      (el) => el.getAttribute('src') === '/theme-init.js',
    )
    const lastMeta = head.findLastIndex(
      (el) => el.getAttribute('name') === 'theme-color',
    )

    expect(script).toBeGreaterThan(lastMeta)
    const el = head[script]
    expect(el?.hasAttribute('type')).toBe(false)
    expect(el?.hasAttribute('async')).toBe(false)
    expect(el?.hasAttribute('defer')).toBe(false)
  })
})

describe('the dialog scrim (M4, M-6)', () => {
  const dialogCss = readFileSync(
    `${import.meta.dirname}/../ui/Dialog.module.css`,
    'utf8',
  )

  it('darkens behind a dialog in both themes, never lightens', () => {
    for (const theme of ['light', 'dark'] as const) {
      const scrim = tokens(PALETTES[theme]).get('--color-scrim') ?? ''
      // A near-black at a low opacity: never the theme's ink.
      const match = /^rgb\((\d+) (\d+) (\d+) \/ (0\.\d+)\)$/.exec(scrim)
      expect(match, `${theme} scrim ${scrim}`).not.toBeNull()
      const [, r, g, b, alpha] = (match ?? []).map(Number)
      expect(Math.max(r ?? 255, g ?? 255, b ?? 255)).toBeLessThanOrEqual(32)
      expect(alpha).toBeGreaterThan(0)
      expect(alpha).toBeLessThanOrEqual(0.5)
    }
    expect(dialogCss).toMatch(
      /\.dialog::backdrop\s*\{\s*background: var\(--color-scrim\);/,
    )
  })
})
