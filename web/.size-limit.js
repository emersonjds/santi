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

const firstVisit = (...routes) => {
  const keys = new Set(
    ['index.html', ...routes].flatMap((key) => [...withImports(key)])
  )
  return [...keys].map((key) => `dist/${manifest[key].file}`)
}

const split = (route) => `src/app/routes/${route}?tsr-split=component`
const SHELL = split('_authenticated/route.tsx')

export default [
  {
    name: 'initial JS, /app/login',
    path: firstVisit(split('login.tsx')),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /app (home, with the shell)',
    path: firstVisit(SHELL, split('_authenticated/index.tsx')),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /app/p/KEY/board (project page)',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/board.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
]
