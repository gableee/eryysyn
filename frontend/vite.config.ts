/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { cspPlugin } from './csp.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      react(),
      // production build only (see csp.ts); skipped when the URLs are missing, e.g. in tests
      ...(env.VITE_API_URL && env.VITE_SUPABASE_URL ? [cspPlugin(env.VITE_API_URL, env.VITE_SUPABASE_URL)] : []),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: 'src/test/setup.ts',
      css: { modules: { classNameStrategy: 'non-scoped' } },
    },
  }
})
