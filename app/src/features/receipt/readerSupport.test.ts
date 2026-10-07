import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SIMD_PROBE, readerSupport } from './readerSupport.ts'

describe('readerSupport (M2.5 plan, P16)', () => {
  it('is ok where WebAssembly has SIMD, as in Node', () => {
    expect(readerSupport()).toBe('ok')
  })

  it('is noWebAssembly without WebAssembly, as in Lockdown Mode', () => {
    expect(readerSupport({})).toBe('noWebAssembly')
    expect(readerSupport({ WebAssembly: undefined })).toBe('noWebAssembly')
  })

  it('is noWebAssembly when WebAssembly has no validate', () => {
    expect(readerSupport({ WebAssembly: {} })).toBe('noWebAssembly')
  })

  it('is noSimd when the SIMD module doesn’t validate', () => {
    const seen: Uint8Array[] = []
    const scope = {
      WebAssembly: {
        validate: (bytes: Uint8Array) => {
          seen.push(bytes)
          return false
        },
      },
    }
    expect(readerSupport(scope)).toBe('noSimd')
    expect(Array.from(seen[0] ?? [])).toEqual(SIMD_PROBE)
  })

  it('is noSimd when validate throws', () => {
    const scope = {
      WebAssembly: {
        validate: () => {
          throw new Error('not supported')
        },
      },
    }
    expect(readerSupport(scope)).toBe('noSimd')
  })

  it('probes with ONNX Runtime’s own SIMD module', () => {
    // If an onnxruntime-web upgrade changes its probe, update SIMD_PROBE.
    const factory = readFileSync(
      path.resolve('node_modules/onnxruntime-web/lib/wasm/wasm-factory.ts'),
      'utf8',
    )
    const simd =
      /isSimdSupported = [\s\S]*?new Uint8Array\(\[([\d,\s]+)\]/.exec(factory)
    expect(simd).not.toBeNull()
    const bytes = (simd?.[1] ?? '')
      .split(',')
      .map((byte) => byte.trim())
      .filter((byte) => byte !== '')
      .map(Number)
    expect(bytes).toEqual(SIMD_PROBE)
  })
})
