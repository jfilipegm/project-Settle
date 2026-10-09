// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  GENERATED_NOTICES,
  VENDOR_FILES,
  BUNDLED_PACKAGES,
  VENDOR_PACKAGES,
  packageVersion,
  vendorAssets,
} from '../../../scripts/vendor-assets.mjs'

const nodeModules = path.resolve('node_modules')
let outDir = ''

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), 'settle-vendor-'))
  await vendorAssets({ nodeModules, outDir })
}, 60_000)

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true })
})

describe('vendor-assets.mjs (D7, D8, M-I-3)', () => {
  it('copies every listed file', async () => {
    for (const { to } of VENDOR_FILES) {
      expect((await stat(path.join(outDir, to))).isFile(), to).toBe(true)
    }
  })

  it('copies heic-to’s CSP build byte for byte', async () => {
    const copied = await readFile(path.join(outDir, 'heic-to/heic-to.js'))
    const original = await readFile(
      path.join(nodeModules, 'heic-to/dist/csp/heic-to.js'),
    )
    expect(copied.equals(original)).toBe(true)
  })

  it('serves heic-to as an ES module that exports heicTo, imported the way decode.ts does (R5-O-3)', async () => {
    const module = (await import(
      /* @vite-ignore */ pathToFileURL(path.join(outDir, 'heic-to/heic-to.js'))
        .href
    )) as { heicTo?: unknown }
    expect(typeof module.heicTo).toBe('function')
  })

  it('gives every vendored or bundled package a licence file or a notice', async () => {
    for (const pkg of [...VENDOR_PACKAGES, ...BUNDLED_PACKAGES]) {
      for (const { to } of pkg.licenseFiles) {
        const text = await readFile(path.join(outDir, 'licenses', to), 'utf8')
        expect(text.length, to).toBeGreaterThan(100)
      }
      if (pkg.licenseFiles.length === 0) {
        const notices = GENERATED_NOTICES.map((notice) => notice.text).join(
          '\n',
        )
        expect(notices).toContain(pkg.name)
      }
    }
    for (const { to } of GENERATED_NOTICES) {
      expect((await stat(path.join(outDir, 'licenses', to))).isFile()).toBe(
        true,
      )
    }
    const heic = await readFile(
      path.join(outDir, 'licenses/heic-to-LICENSE.txt'),
      'utf8',
    )
    expect(heic).toContain('GNU LESSER GENERAL PUBLIC LICENSE')
  })

  it('fails, naming the file, when a source is missing', async () => {
    const empty = await mkdtemp(path.join(tmpdir(), 'settle-empty-'))
    try {
      await expect(
        vendorAssets({ nodeModules: empty, outDir: path.join(empty, 'out') }),
      ).rejects.toThrow(/heic-to\/dist\/csp\/heic-to\.js/)
    } finally {
      await rm(empty, { recursive: true, force: true })
    }
  })
})

describe('THIRD_PARTY_NOTICES.md', () => {
  it('names every vendored and bundled package with its installed version, licence and source', async () => {
    const notices = await readFile(
      path.resolve('public/THIRD_PARTY_NOTICES.md'),
      'utf8',
    )
    // Prettier pads the table's columns; compare rows with single spaces.
    const rows = notices.replace(/ +/g, ' ')
    for (const pkg of [...VENDOR_PACKAGES, ...BUNDLED_PACKAGES]) {
      const version = await packageVersion(nodeModules, pkg.name)
      expect(rows).toContain(
        `| ${pkg.name} | ${version} | ${pkg.license} | ${pkg.source} |`,
      )
    }
    expect(notices).toContain('LGPL-3.0')
  })
})
