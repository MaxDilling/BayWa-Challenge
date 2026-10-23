import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `--mode single` builds windgap.html: one file, ts engine only, opens via file://.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  publicDir: mode === 'single' ? false : 'public',
  build: { outDir: mode === 'single' ? 'dist/single' : 'dist/web' },
  worker: { format: 'es' },
  server: { fs: { allow: ['..'] } },
}))
