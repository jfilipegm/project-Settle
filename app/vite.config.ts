import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cspMeta } from './cspMeta.ts'

/**
 * ONNX Runtime Web's wasm-only build, which loads its runtime from
 * `vendor/ort/` (`env.wasm.wasmPaths`) and references no wasm itself, so
 * Vite emits no second copy into `dist/assets/` (M2.5 plan, P4). The
 * package's default entry would pull in the WebGPU build. Not under
 * Vitest: there Node resolves the package's own Node entry.
 */
const ortWasmOnly = fileURLToPath(
  new URL(
    './node_modules/onnxruntime-web/dist/ort.wasm.min.mjs',
    import.meta.url,
  ),
)

// https://vite.dev/config/
export default defineConfig({
  // Served at the domain root by a host that rewrites unknown paths to
  // index.html (SPA fallback) -- see docs/adr/0001-web-app-tech-stack.md,
  // decision D11. Path-based routes depend on both.
  base: '/',
  plugins: [react(), cspMeta()],
  resolve: {
    alias:
      process.env.VITEST === undefined
        ? [{ find: /^onnxruntime-web$/, replacement: ortWasmOnly }]
        : [],
  },
  // The PaddleOCR worker is a module worker: it loads ONNX Runtime with a
  // dynamic import.
  worker: { format: 'es' },
})
