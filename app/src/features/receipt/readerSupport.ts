/**
 * Whether this browser can run the reader (M2.5 plan, P16, CP6A). The
 * reader is ONNX Runtime on WebAssembly with SIMD: ONNX Runtime 1.30 ships
 * only its SIMD build and refuses to start without it. Safari's Lockdown
 * Mode turns WebAssembly off altogether, and an older engine may lack SIMD.
 * Either way a photo can't be read, while a PDF's text layer still can (it
 * needs no OCR).
 *
 * Answered synchronously, with no download and no request. The global scope
 * is a parameter, so the tests can pass one without WebAssembly.
 */

export type ReaderSupport = 'ok' | 'noWebAssembly' | 'noSimd'

/**
 * ONNX Runtime 1.30's own SIMD probe, byte for byte
 * (`onnxruntime-web/lib/wasm/wasm-factory.ts`, `isSimdSupported`), so this
 * check and the runtime's can't disagree. `readerSupport.test.ts` fails if
 * an upgrade changes it. The module, as WAT:
 *
 *   (module (type $t0 (func)) (func $f0 (type $t0)
 *     (drop (i32x4.dot_i16x8_s (i8x16.splat (i32.const 0))
 *       (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))))
 */
export const SIMD_PROBE: readonly number[] = [
  0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1, 28, 0,
  65, 0, 253, 15, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253,
  186, 1, 26, 11,
]

/** The part of the global scope the check reads. */
export interface SupportScope {
  WebAssembly?: { validate?: unknown } | undefined
}

export function readerSupport(scope: SupportScope = globalThis): ReaderSupport {
  const wasm = scope.WebAssembly
  if (wasm === undefined || typeof wasm.validate !== 'function') {
    return 'noWebAssembly'
  }
  const validate = wasm.validate as (bytes: Uint8Array) => unknown
  try {
    return validate.call(wasm, new Uint8Array(SIMD_PROBE)) === true
      ? 'ok'
      : 'noSimd'
  } catch {
    // A non-standard WebAssembly that throws can't run the reader either.
    return 'noSimd'
  }
}
