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

/** PaddleOCR's detection and recognition options this engine sets. */
export interface ReadingOptions {
  detection?: Record<string, unknown>
  recognition?: Record<string, unknown>
  /**
   * CP3: a box over two lines or more (taller than twice the page's median
   * box) is read again on its own, enlarged, so detection can part its
   * lines: two prices in one box otherwise read as one wrong number.
   */
  splitTall?: boolean
}

/**
 * The reading options CP3 kept (M2.5 plan, P8), each measured on the local
 * set: the library's defaults, and tall boxes read again.
 */
export const READING_OPTIONS: ReadingOptions = { splitTall: true }

export interface PaddleEngineOptions {
  models: PaddleModels
  /** Where ONNX Runtime loads its wasm from (the browser's `vendor/ort/`). */
  wasmPaths?: string
  /**
   * Runs after the libraries load and before the engine starts: the Node
   * tests register a canvas implementation here.
   */
  setUp?: () => Promise<void>
  /**
   * Overrides of {@link READING_OPTIONS}, for CP3's experiments
   * (`SETTLE_PADDLE_OPTIONS` in Node, `--options` in
   * `scripts/diag-lines.mjs`). The app never passes any.
   */
  overrides?: ReadingOptions
}

export interface PaddleEngine {
  /** One page's text boxes, in the page's pixels. */
  read(page: ReceiptPage): Promise<PaddleBox[]>
  dispose(): Promise<void>
}

interface Canvas2d {
  width: number
  height: number
  getContext(type: '2d'): {
    drawImage(
      image: unknown,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ): void
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
  overrides = {},
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
    detection: { ...READING_OPTIONS.detection, ...overrides.detection },
    recognition: { ...READING_OPTIONS.recognition, ...overrides.recognition },
  } as unknown as ConstructorParameters<typeof PaddleOcrService>[0])
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
      const result = await service.recognize(canvas, {
        flatten: true,
        noCache: true,
      })
      if (!('results' in result)) return []
      const boxes: PaddleBox[] = result.results.map((item) => ({
        text: item.text,
        confidence: item.confidence,
        box: {
          x: item.box.x,
          y: item.box.y,
          width: item.box.width,
          height: item.box.height,
        },
      }))
      const splitTall = overrides.splitTall ?? READING_OPTIONS.splitTall
      return splitTall === true ? splitTallBoxes(canvas, boxes) : boxes
    },
    dispose: () => service.destroy(),
  }

  async function splitTallBoxes(
    canvas: Canvas2d,
    boxes: readonly PaddleBox[],
  ): Promise<PaddleBox[]> {
    const heights = boxes.map((entry) => entry.box.height).sort((a, b) => a - b)
    const median = heights[Math.floor(heights.length / 2)] ?? 0
    const out: PaddleBox[] = []
    for (const entry of boxes) {
      if (median === 0 || entry.box.height <= 2 * median) {
        out.push(entry)
        continue
      }
      const pad = Math.round(median / 2)
      const x = Math.max(0, Math.floor(entry.box.x - pad))
      const y = Math.max(0, Math.floor(entry.box.y - pad / 2))
      const width = Math.min(
        canvas.width - x,
        Math.ceil(entry.box.width + 2 * pad),
      )
      const height = Math.min(
        canvas.height - y,
        Math.ceil(entry.box.height + pad),
      )
      const crop = getPlatform().createCanvas(
        width * TALL_SCALE,
        height * TALL_SCALE,
      ) as unknown as Canvas2d
      crop
        .getContext('2d')
        ?.drawImage(canvas, x, y, width, height, 0, 0, crop.width, crop.height)
      const again = await service.recognize(crop, {
        flatten: true,
        noCache: true,
      })
      // Only parts of this box: the crop's margin may hold its neighbours,
      // already read.
      const parts = ('results' in again ? again.results : [])
        .map((part): PaddleBox => ({
          text: part.text,
          confidence: part.confidence,
          box: {
            x: x + part.box.x / TALL_SCALE,
            y: y + part.box.y / TALL_SCALE,
            width: part.box.width / TALL_SCALE,
            height: part.box.height / TALL_SCALE,
          },
        }))
        .filter(
          (part) =>
            contains(entry.box, centreOf(part.box)) &&
            !boxes.some(
              (other) =>
                other !== entry && overlapShare(part.box, other.box) > 0.5,
            ),
        )
      if (parts.length < 2) {
        out.push(entry)
        continue
      }
      out.push(...parts)
    }
    return out
  }
}

/** How much a tall box is enlarged before it's read again. */
const TALL_SCALE = 2

type Rect = PaddleBox['box']

function centreOf(box: Rect): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function contains(box: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  )
}

/** The share of `box`'s area that `other` covers. */
function overlapShare(box: Rect, other: Rect): number {
  const width =
    Math.min(box.x + box.width, other.x + other.width) -
    Math.max(box.x, other.x)
  const height =
    Math.min(box.y + box.height, other.y + other.height) -
    Math.max(box.y, other.y)
  const area = box.width * box.height
  return width <= 0 || height <= 0 || area === 0 ? 0 : (width * height) / area
}
