/// <reference types="vitest/config" />
import path from 'path'
import { type Plugin, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'

const server = { target: 'http://127.0.0.1:8080', changeOrigin: false }

// Absolute URLs for the landing page's canonical and social tags, robots.txt and sitemap.xml.
const siteUrl = (process.env.VITE_SITE_URL ?? 'http://localhost:8080').replace(
  /\/+$/,
  ''
)
process.env.VITE_SITE_URL = siteUrl

const seoFiles: Plugin = {
  name: 'santi-seo-files',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'robots.txt',
      source: `User-agent: *\nDisallow: /api/\nDisallow: /p/\nSitemap: ${siteUrl}/sitemap.xml\n`,
    })
    this.emitFile({
      type: 'asset',
      fileName: 'sitemap.xml',
      source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}/</loc></url></urlset>\n`,
    })
  },
}

export default defineConfig({
  build: {
    manifest: true,
    rolldownOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        landing: path.resolve(import.meta.dirname, 'landing.html'),
      },
      output: {
        // Every page loads React, the router and the query cache: one file compresses better than ten (D39).
        codeSplitting: {
          groups: [
            {
              name: 'framework',
              test: /node_modules[\\/]\.pnpm[\\/](react|react-dom|scheduler|@tanstack\+(history|query-core|react-query|react-router|react-store|router-core|store))@/,
            },
          ],
        },
      },
    },
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
    seoFiles,
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
        'src/app/landing/landing.ts',
        'src/app/styles/**',
        'src/shared/ui/!(password-input|root-error|santi-mark).tsx',
        'src/shared/lib/use-mobile.tsx',
        'src/test/**',
      ],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
