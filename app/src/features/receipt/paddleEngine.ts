/**
 * The PaddleOCR engine (M2.5 plan, P4, P6), independent of where it runs:
 * the browser's worker (`paddle.worker.ts`) wraps it, and the Node tests
 * call it directly (`importDeps.node.ts`). It takes the models as same-origin
 * URLs, which PaddleOCR's own loader fetches (the app's code opens no
 * network channel, D9), or as bytes (the Node tests), and reads one
 * decoded page into PaddleOCR's text boxes.
 *
 * ONNX Runtime runs its plain wasm build, single-threaded (P4): no WebGPU
 * provider, and no thread workers, which would need cross-origin
 * isolation.
 */
import type { ReceiptPage } from './model.ts'
import type { PaddleBox } from './paddleLines.ts'

/** The two models and the recognition dictionary, as URLs or bytes. */
export interface PaddleModels {
  detection: string | ArrayBuffer
  recognition: string | ArrayBuffer
  dictionary: string | ArrayBuffer
}

export interface PaddleEngineOptions {
  models: PaddleModels
  /** Where ONNX Runtime loads its wasm from (the browser's `vendor/ort/`). */
  wasmPaths?: string
  /**
   * Runs after the libraries load and before the engine starts: the Node
   * tests register a canvas implementation here.
   */
  setUp?: () => Promise<void>
}

export interface PaddleEngine {
  /** One page's text boxes, in the page's pixels. */
  read(page: ReceiptPage): Promise<PaddleBox[]>
  dispose(): Promise<void>
}

interface Canvas2d {
  getContext(type: '2d'): {
    createImageData(
      width: number,
      height: number,
    ): {
      data: Uint8ClampedArray
    }
    putImageData(data: unknown, x: number, y: number): void
  } | null
}

export async function createPaddleEngine({
  models,
  wasmPaths,
  setUp,
}: PaddleEngineOptions): Promise<PaddleEngine> {
  // ONNX Runtime's settings must be in place before ppu-paddle-ocr loads,
  // or it points the runtime at a CDN (which the CSP refuses anyway).
  const ort = await import('onnxruntime-web')
  if (wasmPaths !== undefined) ort.env.wasm.wasmPaths = wasmPaths
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  const { PaddleOcrService } = await import('ppu-paddle-ocr/web')
  const { getPlatform } = await import('ppu-ocv/canvas-web')
  await setUp?.()

  const service = new PaddleOcrService({
    model: {
      detection: models.detection,
      recognition: models.recognition,
      charactersDictionary: models.dictionary,
    },
    session: { executionProviders: ['wasm'], graphOptimizationLevel: 'all' },
  })
  await service.initialize()

  return {
    async read(page) {
      const canvas = getPlatform().createCanvas(
        page.width,
        page.height,
      ) as unknown as Canvas2d
      const context = canvas.getContext('2d')
      if (context === null) throw new Error('No 2D canvas for the page')
      const image = context.createImageData(page.width, page.height)
      image.data.set(page.data)
      context.putImageData(image, 0, 0)
      // `noCache`: no page is kept in the library's result cache.
      const result = await service.recognize(
        canvas as unknown as Parameters<typeof service.recognize>[0],
        { flatten: true, noCache: true },
      )
      if (!('results' in result)) return []
      return result.results.map((item) => ({
        text: item.text,
        confidence: item.confidence,
        box: {
          x: item.box.x,
          y: item.box.y,
          width: item.box.width,
          height: item.box.height,
        },
      }))
    },
    dispose: () => service.destroy(),
  }
}
