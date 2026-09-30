## ADDED Requirements

### Requirement: HybridSearch headless API

The package MUST export class `HybridSearch` with constructor options `indexUrl`, `vectorsUrl`, thresholds, `loadFuse`, `loadTransformers`, and methods `initFuzzy`, `initSemantic`, `fuzzySearch`, `semanticSearch`, `search`, `mergeResults`, `onSemanticProgress`.

#### Scenario: hybrid mode shape
- **GIVEN** an initialized engine with injectable Fuse
- **WHEN** `search(q, { mode: 'hybrid' })` runs
- **THEN** the result includes `merged` hits with `doc`, `score`, and `source`

### Requirement: graceful semantic failure

When semantic init/search fails, hybrid mode MUST degrade to fuzzy results without throwing from `search`.

#### Scenario: semantic error degrades
- **GIVEN** a failing transformers loader
- **WHEN** hybrid search runs after fuzzy init
- **THEN** fuzzy merged results are still returned

### Requirement: injectable loaders

Hosts MUST be able to inject Fuse and Transformers modules for CSP.

#### Scenario: custom Fuse
- **GIVEN** `loadFuse` returning bundled Fuse
- **WHEN** `initFuzzy` runs
- **THEN** the CDN Fuse loader is not required
