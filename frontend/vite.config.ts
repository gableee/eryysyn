/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { cspPluginsFor } from './csp.ts'
import { pdfAssets } from './pdfAssets.ts'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      react(),
      pdfAssets(),                       // PDF.js decoders, character maps and fonts at /pdfjs/ (dev and build)
      ...cspPluginsFor(command, env),   // production build only; fails the build if the URLs are missing
    ],
    test: {
      environment: 'jsdom',
      setupFiles: 'src/test/setup.ts',
      css: { modules: { classNameStrategy: 'non-scoped' } },
    },
  }
})
