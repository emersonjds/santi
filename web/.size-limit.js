// Initial JS of a first visit: the entry, its static imports and the landing route's chunks,
// read from the Vite manifest so the budget follows renamed chunks. `pnpm build` moves it out of
// dist, so the server never ships it.
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(
  readFileSync('node_modules/.tmp/vite-manifest.json', 'utf8')
)

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

// A lazy chunk with whatever it pulls in beyond the first visit of `routes`.
const lazyChunk = (source, ...routes) => {
  const initial = new Set(firstVisit(...routes))
  return [...withImports(source)]
    .map((key) => `dist/${manifest[key].file}`)
    .filter((file) => !initial.has(file))
}

const split = (route) => `src/app/routes/${route}?tsr-split=component`
const SHELL = split('_authenticated/route.tsx')

const landing = [...withImports('landing.html')]

export default [
  {
    name: 'landing page JS (/ signed out, /about)',
    path: landing.map((key) => `dist/${manifest[key].file}`),
    limit: '10 KB',
    gzip: true,
  },
  {
    name: 'landing page CSS',
    path: manifest['landing.html'].css.map((file) => `dist/${file}`),
    limit: '10 KB',
    gzip: true,
  },
  {
    name: 'landing page hero screenshot',
    path: 'dist/assets/board-1500-*.webp',
    limit: '60 KB',
    gzip: false,
    brotli: false,
  },
  {
    name: 'initial JS, /login',
    path: firstVisit(split('login.tsx')),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, / (home, with the shell)',
    path: firstVisit(SHELL, split('_authenticated/index.tsx')),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /projects (all projects)',
    path: firstVisit(SHELL, split('_authenticated/projects/index.tsx')),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /account',
    path: firstVisit(SHELL, split('_authenticated/account.tsx')),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /p/KEY/board (project page)',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/board.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /p/KEY/issues/N (issue page)',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/issues/$number.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'markdown view chunk (issue page)',
    path: lazyChunk(
      'src/features/rich-text/markdown-view.tsx',
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/issues/$number.tsx')
    ),
    limit: '50 KB',
    gzip: true,
  },
  {
    // D50: loaded on idle, never part of the first visit; counts the Radix menu code it may pull in.
    name: 'rich text editor chunk (issue page)',
    path: lazyChunk(
      'src/features/rich-text/rich-text-editor.tsx',
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/issues/$number.tsx')
    ),
    limit: '150 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /p/KEY/backlog (backlog)',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/backlog.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /p/KEY/reports',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/reports/index.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /p/KEY/people',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/people.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /p/KEY/reports/N (sprint report)',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/reports/$id.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /p/KEY/settings/members (members)',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/settings/members.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /p/KEY/settings (board settings)',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/settings/index.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
  {
    name: 'initial JS, /p/KEY/settings/import (importer)',
    path: firstVisit(
      SHELL,
      split('_authenticated/p/$key/route.tsx'),
      split('_authenticated/p/$key/settings/import.tsx')
    ),
    limit: '170 KB',
    gzip: true,
  },
]
