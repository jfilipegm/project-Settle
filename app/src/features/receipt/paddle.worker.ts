/// <reference lib="webworker" />
/**
 * The PaddleOCR worker (M2.5 plan, P6): a dedicated module worker that
 * loads the engine once and reads the pages the reader transfers to it.
 * PaddleOCR's loader fetches the models from the app's own origin
 * (`vendor/paddle/`); a failed fetch or a runtime that won't start is
 * `assetsUnavailable`, a failed read `ocrFailed`. Nothing here leaves the
 * device.
 *
 * P11: a `check` request runs detection alone on the page and answers the
 * photo quality check's findings (`null` if it failed: it only ever
 * warns). The reader sends it before the page's `read`.
 */
import { createPaddleEngine, type PaddleEngine } from './paddleEngine.ts'
import { assessPhoto } from './photoQuality.ts'
import type { PaddleRequest, PaddleResponse } from './paddleReader.ts'

declare const self: DedicatedWorkerGlobalScope

let engine: PaddleEngine | undefined

const reply = (response: PaddleResponse) => {
  self.postMessage(response)
}

self.onmessage = async (event: MessageEvent<PaddleRequest>) => {
  const request = event.data
  if (request.type === 'load') {
    try {
      const { detection, recognition, dictionary, wasmPaths } = request.assets
      engine = await createPaddleEngine({
        models: { detection, recognition, dictionary },
        wasmPaths,
      })
      reply({ type: 'loaded' })
    } catch (error) {
      console.error('PaddleOCR failed to load', error)
      reply({ type: 'failed', code: 'assetsUnavailable' })
    }
    return
  }
  const page = {
    width: request.width,
    height: request.height,
    data: new Uint8ClampedArray(request.data),
  }
  if (request.type === 'check') {
    try {
      if (engine === undefined) throw new Error('The engine is not loaded')
      const started = performance.now()
      const quality = assessPhoto(page, await engine.detect(page))
      reply({
        type: 'quality',
        id: request.id,
        quality: {
          ...quality,
          milliseconds: Math.round(performance.now() - started),
        },
      })
    } catch (error) {
      console.error('The photo quality check failed', error)
      reply({ type: 'quality', id: request.id, quality: null })
    }
    return
  }
  try {
    if (engine === undefined) throw new Error('The engine is not loaded')
    const boxes = await engine.read(page)
    reply({ type: 'boxes', id: request.id, boxes })
  } catch (error) {
    console.error('PaddleOCR failed to read', error)
    reply({ type: 'failed', code: 'ocrFailed', id: request.id })
  }
}
