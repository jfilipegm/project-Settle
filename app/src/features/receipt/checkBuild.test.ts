// @vitest-environment node
/** check-build.mjs (M2.5 plan, P4), on invented build folders. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBuild } from '../../../scripts/check-build.mjs'

let dist = ''

async function files(...names: string[]) {
  for (const name of names) {
    await mkdir(path.dirname(path.join(dist, name)), { recursive: true })
    await writeFile(path.join(dist, name), 'x')
  }
}

beforeEach(async () => {
  dist = await mkdtemp(path.join(tmpdir(), 'settle-dist-'))
})

afterEach(async () => {
  await rm(dist, { recursive: true, force: true })
})

describe('check-build.mjs', () => {
  it('passes one plain SIMD wasm under vendor/ort/', async () => {
    await files(
      'index.html',
      'vendor/ort/ort-wasm-simd-threaded.wasm',
      'vendor/ort/ort-wasm-simd-threaded.mjs',
      'vendor/zxing/zxing_reader.wasm',
      'assets/index-abc.js',
    )
    expect(await checkBuild(dist)).toEqual([])
  })

  it('fails a second copy Vite emitted into assets/', async () => {
    await files(
      'vendor/ort/ort-wasm-simd-threaded.wasm',
      'assets/ort-wasm-simd-threaded.jsep-MDYUKy93.wasm',
    )
    expect(await checkBuild(dist)).toEqual([
      'unexpected assets/ort-wasm-simd-threaded.jsep-MDYUKy93.wasm',
    ])
  })

  it('fails another runtime build in vendor/', async () => {
    await files(
      'vendor/ort/ort-wasm-simd-threaded.wasm',
      'vendor/ort/ort-wasm-simd-threaded.jspi.wasm',
    )
    expect(await checkBuild(dist)).toEqual([
      'unexpected vendor/ort/ort-wasm-simd-threaded.jspi.wasm',
    ])
  })

  it('fails a build without the runtime', async () => {
    await files('index.html')
    expect(await checkBuild(dist)).toEqual([
      'missing vendor/ort/ort-wasm-simd-threaded.wasm',
    ])
  })
})
