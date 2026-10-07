# Contributing

Thanks for helping with `@vanduo-oss/vwl-hybrid-search`.

## Prerequisites

- Node `>=20.19`
- pnpm `>=10` (see `packageManager` in `package.json`)

## Workflow

1. Install: `pnpm install`
2. Make changes under `src/`, `tests/`, or `scripts/`
3. Format/lint: `pnpm format && pnpm lint && pnpm typecheck`
4. Unit/CI gate: `pnpm test:ci` (coverage ≥90% on `src/**`; no MiniLM download)
5. Optional local inference gate (Apple Silicon / decent RAM recommended):
   `pnpm test:local`
6. Build: `pnpm build`

OpenSpec under `openspec/` is the source of truth for intentional changes.
Use the repo’s OpenSpec skills/CLI when proposing or applying larger changes.

## Tests

- **CI / default:** `tests/**/*.spec.ts` excluding `tests/e2e/**`, with mocked
  `fetch` and injectable Fuse/Transformers.
- **Local e2e:** `tests/e2e/` uses real `fuse.js` + `@huggingface/transformers`
  MiniLM against fixtures. Model downloads cache under
  `tests/e2e/.model-cache/` (gitignored).

Do not add GitHub Actions. Keep MiniLM inference out of `pnpm test:ci`.

## Pull requests

- Keep PRs focused; match existing TypeScript style.
- Update `CHANGELOG.md` for user-visible changes.
- Do not commit `dist/`, `coverage/`, `*.tgz`, or model caches.
