## Context

Labs shipped `NeptuneSearch` inside `@vanduo-oss/vwl-engines`. The new private repo is named `vwl-hybrid-search`; the public class is `HybridSearch` (product id VwlHybridSearch).

## Goals / Non-Goals

**Goals:** typed HybridSearch API, injectable Fuse/Transformers, corpus-agnostic guardrails, vitest, OpenSpec SoT.

**Non-Goals:** UI preload/autofocus (host concerns), npm publish, CI, labs rewire.

## Decisions

1. Rename surface `NeptuneSearch` → `HybridSearch`; version const `VWL_HYBRID_SEARCH_VERSION`.
2. Headless only — drop DOM `NeptuneSearchUI` from the package.
3. Duplicate `guardrails/core` into this package.
4. Ship indexer script + curriculum-shaped fixture; do not ship vd3-docs corpus as the product default.

## Risks / Trade-offs

- Breaking rename for consumers — mitigated by in-scope ts-school migration.

## Migration Plan

Update ts-school imports and types; keep labs on Neptune until later.

## Open Questions

- None.
