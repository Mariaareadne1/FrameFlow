import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    // app.getVersion() reports Electron's version when run unpackaged; embed ours.
    define: { __FRAMEFLOW_VERSION__: JSON.stringify(pkg.version) },
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
    plugins: [
      react(),
      tailwindcss(),
      {
        // The dev server's HMR websocket is not needed (or allowed) in production builds.
        name: 'frameflow-strip-dev-csp',
        apply: 'build',
        transformIndexHtml: (html: string) => html.replace(' ws://localhost:*', ''),
      },
    ],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
})
