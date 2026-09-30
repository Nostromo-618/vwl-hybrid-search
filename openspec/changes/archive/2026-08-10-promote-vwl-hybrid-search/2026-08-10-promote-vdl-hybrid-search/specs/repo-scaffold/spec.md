## ADDED Requirements

### Requirement: package-metadata

The package MUST declare `@vanduo-oss/vwl-hybrid-search` with exports for `.` and `./guardrails/search`, MIT license, pnpm 10, node `>=20.19.0`. It MAY be `private: true` while unpublished.

#### Scenario: version sync
- **GIVEN** package version `0.1.0`
- **WHEN** smoke tests run
- **THEN** `VWL_HYBRID_SEARCH_VERSION` equals `0.1.0`

### Requirement: no-ci-while-private

The repository MUST NOT include GitHub Actions workflows while the package remains private.

#### Scenario: absent workflows
- **GIVEN** repo root
- **WHEN** `.github/workflows` is checked
- **THEN** it is absent or empty
