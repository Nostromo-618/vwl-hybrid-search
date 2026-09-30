## ADDED Requirements

### Requirement: Fuzzy match quality signals

`HybridSearch` MUST accept optional `fuzzyMinScore` and `titleExactBoost` constructor options, both defaulting to `0` so ranking and inclusion match prior releases when unset. Fuzzy-sourced `MergedHit`s MUST include optional `titleMatch` (`exact` | `partial` | `none`) and `weakMatch` (true when title match is not exact) when a query is available. `mergeResults` MUST accept an optional third `query` argument; `search()` MUST pass the normalized query into merge and the fuzzy-only merged path. Semantic-sourced hits MUST omit these fields. Scores below `fuzzyMinScore` MUST be dropped from fuzzy merged results; `titleExactBoost` MUST be added only when `titleMatch` is `exact`.

#### Scenario: defaults preserve prior ranking
- **GIVEN** `fuzzyMinScore` and `titleExactBoost` are unset (default `0`)
- **WHEN** fuzzy or hybrid search runs
- **THEN** inclusion and numeric scores match pre-signal behavior aside from additive metadata fields

#### Scenario: getting-started near-miss is weak
- **GIVEN** corpus docs `getting-started` (title “Getting Started”) and `installing-types` (title “Getting types for your dependencies”)
- **WHEN** fuzzy search runs for “getting started”
- **THEN** `installing-types` has `titleMatch: 'partial'` and `weakMatch: true`
- **AND** `getting-started` has `titleMatch: 'exact'` and `weakMatch: false`

#### Scenario: exact title boost is opt-in
- **GIVEN** `titleExactBoost` is `0.5`
- **WHEN** fuzzy search runs for a query that exactly equals a doc title
- **THEN** that hit’s score is `0.5` higher than with default boost `0`

#### Scenario: mergeResults without query skips signals
- **GIVEN** `mergeResults` is called with fuzzy hits and no query argument
- **WHEN** results are returned
- **THEN** fuzzy hits omit `titleMatch` and `weakMatch`
