## Why

Promote labs Neptune hybrid search into `@vanduo-oss/vwl-hybrid-search` with a renamed headless `HybridSearch` API so ts-school can dogfood a dedicated package.

## What Changes

- Standalone TypeScript package exporting `HybridSearch` (formerly `NeptuneSearch`)
- Search guardrails extracted into the package
- Corpus-agnostic index validation + indexer script + curriculum fixture
- Vitest coverage for math helpers, merge, guardrails, smoke

## Capabilities

### New Capabilities

- `repo-scaffold`: package metadata, build, gates (no CI)
- `vwl-hybrid-search`: headless HybridSearch engine
- `vwl-guardrails-search`: query/index/vector validation helpers

### Modified Capabilities

- (none — greenfield; rename is the migration)

## Impact

- ts-school replaces `NeptuneSearch` imports with `HybridSearch`
- Labs keeps Neptune naming for demos until a follow-up

## Non-goals

- npm publish, CI, Vue/DOM UI, third guardrails package, labs rewire
