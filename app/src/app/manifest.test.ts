/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import manifestJson from '../../public/manifest.webmanifest?raw'
import { THEME_COLORS } from './theme.ts'

// From disk: Vitest stubs CSS imports, `?raw` included, to an empty string.
const publicDir = `${import.meta.dirname}/../../public`
const tokensCss = readFileSync(
  `${import.meta.dirname}/../styles/tokens.css`,
  'utf8',
)

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose: string
}

const manifest = JSON.parse(manifestJson) as {
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: ManifestIcon[]
}

/** A light-palette token's value from the `:root` block. */
function lightToken(name: string): string | undefined {
  const root = tokensCss.slice(tokensCss.indexOf(':root {'))
  return new RegExp(`${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim()
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): string {
  const png = readFileSync(path)
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`
}

describe('manifest.webmanifest', () => {
  it('starts at the root, standalone (ADR D11)', () => {
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
  })

  it('uses the light palette’s colours from tokens.css', () => {
    expect(manifest.theme_color).toBe(THEME_COLORS.light)
    expect(manifest.theme_color).toBe(lightToken('--color-surface'))
    expect(manifest.background_color).toBe(lightToken('--color-bg'))
  })

  it('has 192 and 512 px icons and a maskable one', () => {
    const any = manifest.icons.filter((icon) => icon.purpose === 'any')
    expect(any.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    )
    expect(
      manifest.icons.some(
        (icon) => icon.purpose === 'maskable' && icon.sizes === '512x512',
      ),
    ).toBe(true)
  })

  it.each(manifest.icons.map((icon) => [icon.src, icon] as const))(
    '%s exists with its declared size',
    (src, icon) => {
      const path = `${publicDir}${src}`
      expect(existsSync(path)).toBe(true)
      if (icon.type === 'image/png') {
        expect(pngSize(path)).toBe(icon.sizes)
      }
    },
  )
})

describe('index.html', () => {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html')

  it.each([
    ['manifest', '/manifest.webmanifest'],
    ['apple-touch-icon', '/icons/apple-touch-icon.png'],
    ['icon', '/icons/icon.svg'],
  ])('links rel=%s to an existing %s', (rel, href) => {
    expect(doc.querySelector(`link[rel="${rel}"]`)?.getAttribute('href')).toBe(
      href,
    )
    expect(existsSync(`${publicDir}${href}`)).toBe(true)
  })

  it('has a 180 px apple-touch-icon', () => {
    expect(pngSize(`${publicDir}/icons/apple-touch-icon.png`)).toBe('180x180')
  })
})
