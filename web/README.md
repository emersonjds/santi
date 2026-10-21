# santi web

React SPA for santi (D37, D38 in `../docs/specs/decisions.md`): Vite, TanStack Router and Query,
react-hook-form + zod, Tailwind and shadcn/ui, organized by Feature-Sliced Design
(`src/app → pages → widgets → features → entities → shared`, imports only downward).

## Run

```sh
pnpm install
pnpm dev            # http://localhost:5173 — proxies /api, /openapi.json, /health to the server on 8080
pnpm build          # web/dist; the server serves it at / from SANTI_WEB_DIR (default web/dist)
```

## Check

```sh
pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build && pnpm size
pnpm e2e            # Playwright against a running server: E2E_BASE_URL (default http://localhost:8089)
pnpm gen:api        # src/shared/api/schema.d.ts from openapi.json (the server writes it: UPDATE_OPENAPI=1)
```

Component tests run in Vitest browser mode (Chromium). Install it once with
`pnpm exec playwright install chromium`.

## Credits

Built on [shadcn-admin](https://github.com/satnaing/shadcn-admin) by Sat Naing, MIT, imported at
commit `e16c87f` (v2.2.1); its notice is kept in `LICENSE-shadcn-admin`. santi's own code is
AGPL-3.0-only (see `../LICENSE`).
