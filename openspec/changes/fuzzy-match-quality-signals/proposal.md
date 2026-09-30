## Why

Fuzzy onboarding queries ("TypeScript getting started") can rank near-miss titles
("Getting types for your dependencies") highly enough that tool-using tutors affirm
the wrong lesson. Consumers need optional quality signals without changing default ranking.

## What Changes

- Optional `fuzzyMinScore` and `titleExactBoost` constructor options (default `0`)
- `MergedHit` optional `weakMatch` and `titleMatch` on fuzzy-sourced hits
- Applied in `mergeResults` and the fuzzy-only `search` path
- Fixture + unit coverage for the getting-started near-miss

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `vwl-hybrid-search`: fuzzy match quality signals

## Impact

- Tutors can refuse soft matches via `weakMatch` / `titleMatch` without title deny-lists
- Defaults preserve 0.1.1 ranking and inclusion (backwards compatible)

## Non-goals

- Changing Fuse keys/weights or default `fuseThreshold`
- Title signals on semantic-only hits
- Consumer-side post-filter policy (apps keep until they opt in)
