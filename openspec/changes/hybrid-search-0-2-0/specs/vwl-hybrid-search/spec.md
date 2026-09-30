## ADDED Requirements

### Requirement: Embedding presets

The library SHALL export `EMBEDDING_PRESETS` with `embeddinggemma`, `minilm`, and `e5`
entries bundling `modelName`, `dtype`, `dimensions`, and prefix strategy.

#### Scenario: Default preset is EmbeddingGemma

- **WHEN** `new HybridSearch()` is constructed without options
- **THEN** `modelName` SHALL be `onnx-community/embeddinggemma-300m-ONNX`
- **AND** `embeddingPreset` SHALL be `embeddinggemma`

### Requirement: Transformers.js v4 dtype

The library SHALL pass `{ dtype }` to the Transformers pipeline and translate legacy
`quantized: true` to `dtype: 'q8'`.

### Requirement: Confidence cutoff

`mergeResults()` SHALL apply adaptive confidence filtering by default and accept
`confidence: false` to disable it.

### Requirement: maxSemanticResults

Semantic hits SHALL be capped by `maxSemanticResults` (default 10) instead of a
hardcoded slice.

## MODIFIED Requirements

### Requirement: Semantic query prefixing

`semanticSearch()` SHALL prepend the active `queryPrefix` before embedding when the
query does not already start with a known prefix.
