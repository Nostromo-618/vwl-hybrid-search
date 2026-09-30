## MODIFIED Requirements

### Requirement: package-metadata

The package MUST declare `@vanduo-oss/vwl-hybrid-search` with exports for `.` and `./guardrails/search`, MIT license, pnpm 10, node `>=20.19.0`. It MUST be publishable (MUST NOT set `"private": true`) with `publishConfig.access` of `public`.

#### Scenario: version sync
- **GIVEN** package version `0.1.1`
- **WHEN** smoke tests run
- **THEN** `VWL_HYBRID_SEARCH_VERSION` equals `0.1.1`

#### Scenario: package is not private
- **WHEN** `package.json` is inspected for a release candidate
- **THEN** `"private"` MUST be absent or false
- **AND** `publishConfig.access` MUST be `public`

## REMOVED Requirements

### Requirement: no-ci-while-private

**Reason:** The package is being prepared for public npm release; CI is required as a remote quality gate.

**Migration:** Replace with GitHub Actions CI that runs format, lint, typecheck, unit coverage, build, pack dry-run, and audit — without requiring GPU inference.

## ADDED Requirements

### Requirement: github-actions-ci

The repository MUST include a GitHub Actions workflow on push/PR to `main` that runs format check, lint, typecheck, `test:ci`, build, `pnpm pack --dry-run`, and dependency audit.

#### Scenario: CI does not require local inference gate
- **WHEN** the CI workflow executes
- **THEN** it MUST NOT require the local MiniLM/Fuse inference suite to pass as part of remote CI
