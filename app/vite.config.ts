import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cspMeta } from './cspMeta.ts'

// https://vite.dev/config/
export default defineConfig({
  // Served at the domain root by a host that rewrites unknown paths to
  // index.html (SPA fallback) -- see docs/adr/0001-web-app-tech-stack.md,
  // decision D11. Path-based routes depend on both.
  base: '/',
  plugins: [react(), cspMeta()],
})
