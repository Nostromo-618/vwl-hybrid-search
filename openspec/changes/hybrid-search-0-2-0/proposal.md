## Why

The vd3-docs site has outpaced the library: EmbeddingGemma presets, Transformers.js v4
`dtype`, query/document prefixes, adaptive confidence cutoff, and a model-configurable
indexer all live in the consumer. Consolidating them into 0.2.0 makes the library the
single source of truth for hybrid search.

## What Changes

- `embeddingPreset` option (`embeddinggemma` default, `minilm`, `e5`, `none`) bundling
  model, dtype, dimensions, and prefix strategy
- Transformers.js v4 pipeline options (`dtype` replaces `quantized`; legacy shim retained)
- CDN bump to `@huggingface/transformers@4`
- Exported `EMBEDDING_PRESETS`, `prefixQuery`, `prefixDocument`
- Adaptive confidence cutoff in `mergeResults` (default on; `confidence: false` to disable)
- `maxSemanticResults` option replacing hardcoded `.slice(0, 10)`
- Model mismatch warning when `vectors.json.model` differs from active `modelName`
- Config-driven `vwl-hybrid-index` CLI for building index + vectors

## Capabilities

### New Capabilities

- `vwl-hybrid-index`: CLI indexer with preset-aware embeddings

### Modified Capabilities

- `vwl-hybrid-search`: presets, v4 dtype, prefixes, confidence, maxSemanticResults

## Impact

- **Breaking:** default model switches from MiniLM to EmbeddingGemma; consumers must
  re-index vectors or pass `embeddingPreset: 'minilm'`
- **Breaking:** default merged results may be shorter due to confidence cutoff
- vd3-docs and vd3 v1.7.0 consume the consolidated API

## Non-goals

- Runtime npm dependencies (still zero)
- Server-side search or hosted embeddings
- Automatic model download in CI
