## Architecture

Presets live in `src/embedding-presets.ts` as the canonical model-selection table.
`HybridSearch` resolves preset → explicit overrides in the constructor. Query prefixes
apply inside `semanticSearch()` before calling the extractor; document prefixes are
exported for indexers via `prefixDocument()`.

Confidence filtering lives in `src/confidence.ts` and runs at the end of
`mergeResults()` when `confidence !== false`. Defaults match vd3-docs tuning
(`minTopScore: 0.53`, `relativeTopFraction: 0.45`).

## Transformers.js v4

Pipeline options use `{ dtype: 'q8' }`. Legacy `{ quantized: true }` is translated
internally. CDN URLs point at `@huggingface/transformers@4`.

## Indexer

`scripts/vwl-hybrid-index.mjs` reads a JSON config or CLI flags, crawls HTML routes,
writes `search-index.json` + `vectors.json` with preset-aware prefixes and metadata.

## Migration

Consumers on MiniLM must either re-index with `embeddingPreset: 'embeddinggemma'` or
pass `embeddingPreset: 'minilm'` until vectors are rebuilt.
