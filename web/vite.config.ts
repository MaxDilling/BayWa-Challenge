import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The ts engine ports windgap and reports its version.
const windgapVersion = /__version__ = "(.+)"/.exec(readFileSync(new URL('../windgap/__init__.py', import.meta.url), 'utf8'))![1]

// `--mode single` builds windgap.html: one file, ts engine only, opens via file://.
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __WINDGAP_VERSION__: JSON.stringify(windgapVersion) },
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  publicDir: mode === 'single' ? false : 'public',
  // jsPDF's HTML and SVG import, which the report does not use, would pull in html2canvas, DOMPurify and canvg.
  build: { outDir: mode === 'single' ? 'dist/single' : 'dist/web', rollupOptions: { external: ['html2canvas', 'dompurify', 'canvg'] } },
  worker: { format: 'es' },
  server: { fs: { allow: ['..'] } },
}))
