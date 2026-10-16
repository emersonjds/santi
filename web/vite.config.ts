/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

const server = { target: 'http://127.0.0.1:8080', changeOrigin: false }

export default defineConfig({
  // The Rust server mounts the build at /app until the htmx cutover (IA §3).
  base: '/app/',
  build: { manifest: true },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  // Split route chunks hide their imports from the dependency scan; a dependency found mid-test reloads Vitest.
  optimizeDeps: { entries: ['src/**/*.tsx'] },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: { '/api': server, '/openapi.json': server, '/health': server },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    silent: 'passed-only',
    unstubGlobals: true,
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    coverage: {
      include: ['src/**'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/app/routeTree.gen.ts',
        'src/app/routes/**',
        'src/app/main.tsx',
        'src/app/styles/**',
        'src/shared/ui/!(password-input|root-error|santi-mark).tsx',
        'src/shared/lib/use-mobile.tsx',
        'src/test/**',
      ],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
