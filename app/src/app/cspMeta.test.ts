import { describe, expect, it } from 'vitest'
import { CSP_POLICY, cspMeta } from '../../cspMeta.ts'

describe('cspMeta (D9)', () => {
  it('is the exact policy, with blob: workers for heic-to', () => {
    expect(CSP_POLICY).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; " +
        "worker-src 'self' blob:; connect-src 'self'; " +
        "img-src 'self' blob: data:; style-src 'self'; font-src 'self'; " +
        "object-src 'none'; base-uri 'self'; form-action 'none'",
    )
  })

  it('only sends to its own origin and never submits a form (M-I-1)', () => {
    expect(CSP_POLICY).toContain("connect-src 'self'")
    expect(CSP_POLICY).toContain("form-action 'none'")
    expect(CSP_POLICY).not.toContain("'unsafe-eval'")
    expect(CSP_POLICY).not.toMatch(/https?:/)
  })

  it('adds the policy to the built page only, never the dev server’s', () => {
    const plugin = cspMeta()
    expect(plugin.apply).toBe('build')
    const hook = plugin.transformIndexHtml
    if (typeof hook !== 'object' || hook === null || !('handler' in hook)) {
      throw new Error('transformIndexHtml should be an object hook')
    }
    const handler = hook.handler as () => unknown
    expect(handler()).toEqual([
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP_POLICY },
        injectTo: 'head-prepend',
      },
    ])
  })
})
