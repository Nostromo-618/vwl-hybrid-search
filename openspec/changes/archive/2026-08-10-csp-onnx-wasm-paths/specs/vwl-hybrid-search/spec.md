## ADDED Requirements

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
