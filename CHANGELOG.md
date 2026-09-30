# Changelog

## Unreleased — local Labs refresh

- Validate corpus/vector identity before loading embeddings; keep fuzzy retrieval available on mismatch.
- Add canonical local HTML/export indexing with atomic dual-preset manifests and provenance.
- Preserve section anchors, API identifiers and bounded examples; use canonical vd3 links.
- Dispose embedding pipelines safely and validate query vector dimensions.
- Tune MiniLM confidence against the retained real-package benchmark.


## 0.2.0 — EmbeddingGemma presets, Transformers.js v4, confidence cutoff

**Migration:** Re-index `vectors.json` when upgrading from 0.1.x. The default model is now
`onnx-community/embeddinggemma-300m-ONNX` (768 dims). Pass `embeddingPreset: 'minilm'` until
vectors are rebuilt, or regenerate with `vwl-hybrid-index --preset embeddinggemma`.

### Added

- `embeddingPreset`: `embeddinggemma` (default), `minilm`, `e5`, `none` — bundles model, dtype,
  dimensions, and query/document prefix strategy.
- Exported `EMBEDDING_PRESETS`, `prefixQuery`, `prefixDocument`, `documentEmbedText`.
- Transformers.js v4 `dtype` pipeline option (legacy `quantized` translated to `dtype`).
- Adaptive confidence cutoff in `mergeResults` (default on; `confidence: false` to disable).
- `maxSemanticResults` option (default 10) replacing hardcoded semantic slice.
- Warning when `vectors.json.model` differs from active `modelName`.
- `vwl-hybrid-index` CLI (`bin`) for config-driven index + vector generation.

### Changed

- CDN default: `@huggingface/transformers@4`.
- Default `modelName`: EmbeddingGemma ONNX (was MiniLM).

## 0.1.2 — fuzzy match quality signals

- Optional `fuzzyMinScore` and `titleExactBoost` (defaults `0`) so ranking/inclusion stay identical unless opted in.
- Fuzzy `MergedHit`s may include `titleMatch` (`exact` | `partial` | `none`) and `weakMatch` so tutors can refuse soft near-misses (e.g. “getting started” vs “Getting types for your dependencies”).
- `mergeResults(fuzzy, semantic, query?)` accepts an optional query for title signals; `search()` always passes the normalized query.

## 0.1.1 — public release candidate

First public npm release of `@vanduo-oss/vwl-hybrid-search`.

- Optional `onnxWasmPaths` for CSP hosts (same-origin ORT WASM).
- Publishable package metadata (`private` removed); `prepublishOnly` runs build + `test:ci`.
- Dual QA gates: `test:ci` (coverage ≥90%, mocked loaders) and `test:local` (real Fuse + MiniLM).
- GitHub Actions CI: format, lint, typecheck, `test:ci`, build, pack dry-run, audit (no inference).
- Expanded README; added SECURITY.md and CONTRIBUTING.md.

## 0.1.0

- Initial promotion from vanduo-oss/labs (`neptune-search.js` → `HybridSearch`) as a standalone TypeScript package.
