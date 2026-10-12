import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: { ...sharedAlias, '@renderer': resolve(__dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
})
