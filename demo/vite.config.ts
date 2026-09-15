import {svelte} from '@sveltejs/vite-plugin-svelte'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
