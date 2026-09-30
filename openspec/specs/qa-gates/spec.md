# qa-gates Specification

## Purpose

Defines dual QA gates and release documentation for publishing
`@vanduo-oss/vwl-hybrid-search` while keeping remote CI free of mandatory heavy
semantic model downloads.

## Requirements

### Requirement: dual-test-tiers

The repository MUST provide two test tiers: a CI-safe unit/coverage suite with
mocked loaders, and a local-only suite that exercises real Fuse.js fuzzy search
and real Transformers.js MiniLM semantic search against fixture corpora on
developer hardware (baseline: Apple Silicon M4 with ≥24GB unified memory).

#### Scenario: CI suite excludes mandatory inference download

- **WHEN** `pnpm test:ci` runs in GitHub Actions
- **THEN** tests MUST pass without requiring a GPU or a warm MiniLM cache
- **AND** coverage thresholds of at least 90% lines, branches, and functions on
  `src/` MUST be enforced for the CI suite

#### Scenario: local suite runs real hybrid search

- **WHEN** a developer runs `pnpm test:local`
- **THEN** the suite MUST run fuzzy search with real Fuse.js
- **AND** MUST run semantic search with real Transformers.js MiniLM against
  fixtures
- **AND** MUST assert at least one relevant hit for a known curriculum query

### Requirement: release-docs

The repository MUST ship README guidance for install, injectable loaders,
`onnxWasmPaths` CSP hosting, indexer usage, local-vs-CI QA, plus SECURITY.md and
CONTRIBUTING.md.

#### Scenario: docs describe CSP and host deps

- **WHEN** a consumer reads README.md
- **THEN** `fuse.js` and `@huggingface/transformers` host-injection MUST be
  documented
- **AND** `onnxWasmPaths` for CSP same-origin WASM MUST be documented
