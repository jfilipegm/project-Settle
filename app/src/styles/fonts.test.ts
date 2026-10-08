// @vitest-environment node
/** The bundled fonts (M3 plan, S4): fonts.css and check-build.mjs's check. */
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  checkFonts,
  EXPECTED_FONTS,
  FONT_BUDGET,
} from '../../scripts/check-build.mjs'

// From disk: Vitest stubs CSS imports, `?raw` included, to an empty string.
const fontsCss = readFileSync(`${import.meta.dirname}/fonts.css`, 'utf8')

describe('fonts.css', () => {
  const faces = [...fontsCss.matchAll(/@font-face \{([^}]*)\}/g)].map(
    ([, body = '']) => body,
  )

  it('declares exactly the faces the build check expects', () => {
    const files = faces.map(
      (body) => /\/files\/([\w-]+)\.woff2'/.exec(body)?.[1],
    )
    expect(files.sort()).toEqual([...EXPECTED_FONTS].sort())
  })

  it('loads woff2 from the packages only, with swap and a unicode-range', () => {
    for (const body of faces) {
      expect(body).toMatch(
        /src: url\('@fontsource\/[\w-]+\/files\/[\w-]+\.woff2'\)\s+format\('woff2'\);/,
      )
      expect(body).not.toMatch(/https?:|\.woff'/)
      expect(body).toContain('font-display: swap;')
      expect(body).toContain('font-style: normal;')
      expect(body).toMatch(/unicode-range:\s+U\+/)
    }
  })
})

let dist = ''

async function file(name: string, content: string | Buffer = 'x') {
  await mkdir(path.dirname(path.join(dist, name)), { recursive: true })
  await writeFile(path.join(dist, name), content)
}

/** Every expected face in assets/, hashed as Vite names them, and a CSS file using them. */
async function goodBuild(fontBytes = 100) {
  const urls: string[] = []
  for (const face of EXPECTED_FONTS) {
    const name = `assets/${face}-AbC-12_x.woff2`
    await file(name, Buffer.alloc(fontBytes))
    urls.push(`url(/${name}) format("woff2")`)
  }
  await file(
    'assets/index-abc.css',
    urls.map((u) => `@font-face{src:${u}}`).join(''),
  )
}

beforeEach(async () => {
  dist = await mkdtemp(path.join(tmpdir(), 'settle-fonts-'))
})

afterEach(async () => {
  await rm(dist, { recursive: true, force: true })
})

describe('check-build.mjs fonts', () => {
  it('passes every face as a same-origin woff2 within budget', async () => {
    await goodBuild()
    expect(await checkFonts(dist)).toEqual([])
  })

  it('fails a missing face and an unexpected one', async () => {
    await goodBuild()
    await rm(path.join(dist, `assets/${EXPECTED_FONTS[0]}-AbC-12_x.woff2`))
    await file('assets/inter-latin-400-normal-AbC-12_x.woff2')
    expect(await checkFonts(dist)).toEqual(
      expect.arrayContaining([
        `missing font ${EXPECTED_FONTS[0]}`,
        'unexpected font assets/inter-latin-400-normal-AbC-12_x.woff2',
      ]),
    )
  })

  it.each([
    'https://fonts.gstatic.com/s/x.woff2',
    'http://example.invalid/x.woff2',
    '//cdn.example.invalid/x.woff2',
  ])('fails a CSS URL on another origin: %s', async (url) => {
    await goodBuild()
    await file('assets/extra-abc.css', `@font-face{src:url("${url}")}`)
    expect(await checkFonts(dist)).toEqual([
      `assets/extra-abc.css loads ${url} from another origin`,
    ])
  })

  it('fails a CSS URL to a font that was not emitted', async () => {
    await goodBuild()
    await file('assets/extra-abc.css', '@font-face{src:url(./gone.woff2)}')
    expect(await checkFonts(dist)).toEqual([
      'assets/extra-abc.css points at a missing ./gone.woff2',
    ])
  })

  it('fails fonts over the first-view and total budgets', async () => {
    // 14 faces, 7 of them latin: over both budgets.
    await goodBuild(Math.ceil(FONT_BUDGET.all / 10))
    const problems = await checkFonts(dist)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^fonts total \d+ bytes, over 400000$/)
    expect(problems[1]).toMatch(
      /^first-view fonts total \d+ bytes, over 250000$/,
    )
  })
})
