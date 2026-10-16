// Initial JS of a first visit: the entry, its static imports and the landing route's chunks,
// read from the Vite manifest so the budget follows renamed chunks.
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'))

const withImports = (key, seen = new Set()) => {
  if (seen.has(key)) return seen
  seen.add(key)
  for (const imported of manifest[key].imports ?? [])
    withImports(imported, seen)
  return seen
}

const firstVisit = (route) => {
  const keys = new Set([...withImports('index.html'), ...withImports(route)])
  return [...keys].map((key) => `dist/${manifest[key].file}`)
}

export default [
  {
    name: 'initial JS, /app/login',
    path: firstVisit('src/app/routes/login.tsx?tsr-split=component'),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /app (home)',
    path: firstVisit(
      'src/app/routes/_authenticated/index.tsx?tsr-split=component'
    ),
    limit: '170 KB',
    gzip: true,
  },
]
