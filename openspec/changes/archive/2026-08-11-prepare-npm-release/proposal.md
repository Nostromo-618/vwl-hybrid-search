## Why

The package is extracted and dogfooded via `file:` but remains private, without CI, with Prettier drift, thin docs, and no dual local-vs-CI QA story. We need a first public npm release of `@vanduo-oss/vwl-hybrid-search@0.1.1`.

## What Changes

- Remove `"private": true` and prepare publish for `@vanduo-oss/vwl-hybrid-search@0.1.1`
- Add GitHub Actions CI (format, lint, typecheck, coverage unit suite, build, pack dry-run, audit) — **no** heavy MiniLM download/inference requirement on CI
- Add local Mac M4 QA gate: real Fuse.js + Transformers.js MiniLM against fixture corpus
- Enforce Prettier/ESLint clean; Vitest coverage thresholds ≥90% on `src/` for CI suites
- Expand README; add SECURITY.md / CONTRIBUTING.md; document host deps and `onnxWasmPaths`
- Update OpenSpec Purpose sections and replace `no-ci-while-private` with CI + dual-gate requirements
- Tag `v0.1.1` + GitHub Release after local gates pass; human runs `npm publish`

## Capabilities

### New Capabilities

- `qa-gates`: Dual test tiers — CI unit/coverage vs local real semantic/fuzzy inference; release hygiene docs

### Modified Capabilities

- `repo-scaffold`: Allow CI; publishable package metadata; remove no-ci-while-private

## Impact

- NeptuneSearch → HybridSearch migration unchanged (already done); this is publish readiness only
- After publish, ts-school switches from `file:` to npm `^0.1.1`
- No new runtime npm dependencies

## Non-goals

- Agent does not run `npm publish`
- No UI, labs rewire, or embedding model changes
- CI will not require GPU or full MiniLM warm download as a blocking remote gate
