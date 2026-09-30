# vwl-hybrid-search Specification

## Purpose

Headless HybridSearch combining Fuse.js fuzzy and Transformers.js MiniLM semantic
retrieval with injectable CDN/host loaders, CSP-safe `onnxWasmPaths`, and
graceful semantic degradation.
## Requirements
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

### Requirement: CSP-safe ONNX WASM paths

`HybridSearch` MUST accept an optional `onnxWasmPaths` constructor option. When set, after loading Transformers and before calling `pipeline`, the engine MUST assign that value to `env.backends.onnx.wasm.wasmPaths` (trailing slash normalized). When omitted, Transformers.js default CDN behavior MUST remain unchanged.

#### Scenario: host injects same-origin wasmPaths
- **GIVEN** `onnxWasmPaths` is `/transformers-wasm/`
- **WHEN** `initSemantic` loads Transformers
- **THEN** `env.backends.onnx.wasm.wasmPaths` equals `/transformers-wasm/` before `pipeline` runs

#### Scenario: omitted option leaves CDN default
- **GIVEN** no `onnxWasmPaths`
- **WHEN** Transformers loads via CDN or injector
- **THEN** HybridSearch does not overwrite `wasmPaths`

### Requirement: Fuzzy match quality signals

`HybridSearch` MUST accept optional `fuzzyMinScore` and `titleExactBoost` constructor options defaulting to `0`. Fuzzy-sourced `MergedHit` results from `search()` MUST include `titleMatch` (`exact` | `partial` | `none`) and `weakMatch` (true when not exact). `mergeResults(fuzzy, semantic, query?)` MUST apply the same fuzzy mapping when `query` is provided; when omitted, title fields MUST be absent. Semantic hits MUST omit title signal fields. Default options MUST preserve prior inclusion and ranking behavior.

#### Scenario: defaults preserve prior ranking

- **GIVEN** default `fuzzyMinScore` and `titleExactBoost`
- **WHEN** hybrid or fuzzy search runs
- **THEN** fuzzy scores remain `1 - fuseScore` with no boost
- **AND** hits are not filtered by a score floor

#### Scenario: getting-started near-miss is marked weak

- **GIVEN** a corpus containing `getting-started` (“Getting Started”) and `installing-types` (“Getting types for your dependencies”)
- **WHEN** fuzzy search runs for `getting started`
- **THEN** the `installing-types` hit has `titleMatch: 'partial'` and `weakMatch: true`
- **AND** the `getting-started` hit has `titleMatch: 'exact'` and `weakMatch: false`

#### Scenario: exact title match is not weak

- **GIVEN** the same corpus
- **WHEN** fuzzy search runs for `Getting Started`
- **THEN** the `getting-started` hit has `titleMatch: 'exact'` and `weakMatch: false`

#### Scenario: titleExactBoost raises exact titles

- **GIVEN** `titleExactBoost` greater than `0`
- **WHEN** fuzzy search runs with a query equal to a document title
- **THEN** that hit’s score equals `1 - fuseScore + titleExactBoost`

#### Scenario: fuzzyMinScore filters weak fuzzy hits

- **GIVEN** `fuzzyMinScore` above a near-miss score
- **WHEN** fuzzy search runs
- **THEN** hits below the floor are excluded from `merged`

