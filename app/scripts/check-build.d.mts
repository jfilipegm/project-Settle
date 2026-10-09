// Types for check-build.mjs, so the tests can import it.

export const EXPECTED_ORT_WASM: string
export function checkBuild(dist: string): Promise<string[]>
export const EXPECTED_FONTS: string[]
export const FONT_BUDGET: { all: number; firstView: number }
export function checkFonts(dist: string): Promise<string[]>
export function fontSizes(
  dist: string,
): Promise<{ all: number; firstView: number }>
export const GALLERY_MARKER: string
export function checkNoGallery(dist: string): Promise<string[]>
