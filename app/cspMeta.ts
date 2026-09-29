/**
 * The production Content-Security-Policy (M2 plan, D9), added to the built
 * index.html as a `<meta>`. Build only: the dev server's HMR needs looser
 * rules.
 *
 * `worker-src` also allows `blob:`, for heic-to's HEIC decoder, which
 * starts its worker from a `blob:` URL (the user's decision in M2-CP2; see
 * docs/adr/0002-in-browser-receipt-reading.md). A `blob:` worker inherits
 * this document's policy, `connect-src 'self'` included.
 */
import type { Plugin } from 'vite'

export const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "img-src 'self' blob: data:",
  "style-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

export function cspMeta(): Plugin {
  return {
    name: 'settle-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: CSP_POLICY,
          },
          injectTo: 'head-prepend',
        },
      ],
    },
  }
}
