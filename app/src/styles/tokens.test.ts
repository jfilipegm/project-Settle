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
  const body = tokensCss.slice(open + 1, tokensCss.indexOf('}', open))
  return body
    .split(';')
    .map((declaration) => declaration.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function surface(declarations: string[]): string | undefined {
  return declarations
    .find((declaration) => declaration.startsWith('--color-surface:'))
    ?.split(':')[1]
    ?.trim()
}

describe('tokens.css', () => {
  it('has the same dark palette for the system and forced dark modes', () => {
    expect(block(":root:not([data-theme='light'])")).toEqual(
      block(":root[data-theme='dark']"),
    )
  })

  it('uses THEME_COLORS as each palette’s --color-surface', () => {
    expect(surface(block(':root'))).toBe(THEME_COLORS.light)
    expect(surface(block(":root[data-theme='dark']"))).toBe(THEME_COLORS.dark)
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
