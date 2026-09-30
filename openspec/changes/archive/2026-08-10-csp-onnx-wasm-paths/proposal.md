## Why

CSP hosts (`script-src 'self'`) cannot load Transformers.js ONNX Runtime WASM from the default jsDelivr URL. Dogfooders like ts-school need a same-origin `wasmPaths` inject point on HybridSearch.

## What Changes

- Add optional `onnxWasmPaths` constructor option
- Apply `env.backends.onnx.wasm.wasmPaths` after `loadTransformers()` and before `pipeline()`

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `vwl-hybrid-search`: CSP-safe ORT WASM path injection

## Impact

- Hosts serving ORT WASM same-origin can pass the directory URL
- Default CDN behavior unchanged when option omitted

## Non-goals

- Shipping ORT WASM inside this package
- Changing CSP policies in consumers
