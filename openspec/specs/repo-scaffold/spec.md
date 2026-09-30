# repo-scaffold Specification

## Purpose

Package scaffold, Labs-sibling metadata, and GitHub Actions CI for
`@vanduo-oss/vwl-hybrid-search` (not a public npm package).

## Requirements

### Requirement: package-metadata

The package MUST declare `@vanduo-oss/vwl-hybrid-search` with dual ESM/CJS
exports and typed entry points. It MUST be a Labs sibling repo
(`"private": true`) and MUST NOT declare `publishConfig` for public npm.

#### Scenario: package is private Labs sibling

- **WHEN** `package.json` is inspected
- **THEN** `"private"` MUST be `true`
- **AND** `publishConfig` MUST be absent

#### Scenario: version sync

- **GIVEN** package version `0.2.0`
- **WHEN** smoke tests run
- **THEN** `VWL_HYBRID_SEARCH_VERSION` equals `0.2.0`

### Requirement: github-actions-ci

The repository MUST include a GitHub Actions workflow on push/PR to `main` that
runs format check, lint, typecheck, `test:ci`, build, and dependency audit. It
MUST NOT run npm publish or treat the package as a registry release.

#### Scenario: CI does not require local inference gate

- **WHEN** the CI workflow executes
- **THEN** it MUST NOT require the local MiniLM/Fuse inference suite to pass as
  part of remote CI
