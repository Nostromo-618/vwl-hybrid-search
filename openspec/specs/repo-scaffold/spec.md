# repo-scaffold Specification

## Purpose

Package scaffold and Labs-sibling metadata for
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

### Requirement: no remote CI

The repository MUST NOT include GitHub Actions workflows or Dependabot config.
Format check, lint, typecheck, `test:ci`, build, and dependency audit stay
local scripts. It MUST NOT run npm publish or treat the package as a registry
release.

#### Scenario: Actions are absent

- **WHEN** `.github` is inspected
- **THEN** it contains no workflow files and no `dependabot.yml`

#### Scenario: the default test script does not require local inference

- **WHEN** `pnpm test:ci` executes
- **THEN** it MUST NOT require the local MiniLM/Fuse inference suite to pass
