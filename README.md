# @vanduo-oss/vwl-hybrid-search

**VwlHybridSearch** — headless hybrid fuzzy + semantic search for documentation and curriculum corpora.

This is a **Labs sibling repo**, not a public npm package. Consume it via `link:` /
workspace next to [Vanduo Web Labs](https://github.com/vanduo-oss/labs).

Fuzzy retrieval uses [Fuse.js](https://www.fusejs.io/). Semantic retrieval uses [Transformers.js](https://huggingface.co/docs/transformers.js) v4 with configurable **embedding presets** (default: **EmbeddingGemma**). The package has **zero runtime npm dependencies**; hosts inject Fuse/Transformers (bundled or CDN) and serve pre-built index/vector JSON.

**Source of truth:** [`openspec/`](./openspec/).

## Install (sibling link)

```bash
git clone https://github.com/vanduo-oss/vwl-hybrid-search.git
cd vwl-hybrid-search && pnpm install && pnpm run build
```

In the host `package.json`:

```json
{
  "dependencies": {
    "@vanduo-oss/vwl-hybrid-search": "link:../vwl-hybrid-search"
  }
}
```

Peer/host libraries (install in the app, not pulled by this package):

```bash
pnpm add fuse.js @huggingface/transformers
```

## Quick start

```ts
import { HybridSearch } from '@vanduo-oss/vwl-hybrid-search';
import Fuse from 'fuse.js';

const search = new HybridSearch({
  indexUrl: '/search/search-index.json',
  vectorsUrl: '/search/vectors.json',
  embeddingPreset: 'embeddinggemma', // default
  loadFuse: async () => ({ default: Fuse }),
  loadTransformers: async () => import('@huggingface/transformers'),
  onnxWasmPaths: '/transformers-wasm/', // CSP script-src 'self'
});

await search.initFuzzy();
const { merged } = await search.search('modal dialog', { mode: 'hybrid' });
```

## Embedding presets

Choose a preset with `embeddingPreset` — it sets `modelName`, `dtype`, dimensions, and prefix strategy in one line. Explicit options override preset defaults.

| Preset | Model | Dims | Prefix strategy | Notes |
| --- | --- | --- | --- | --- |
| `embeddinggemma` (default) | `onnx-community/embeddinggemma-300m-ONNX` | 768 | Query + title/doc prefixes | Best quality; ~300MB download |
| `minilm` | `Xenova/all-MiniLM-L6-v2` | 384 | None | Legacy 0.1.x default; fast |
| `e5` | `Xenova/multilingual-e5-small` | 384 | `query:` / `passage:` | Multilingual |
| `none` | — | — | — | Supply `modelName` + prefixes yourself |

**Rule:** Vectors must match the model, dimensions, dtype, pooling, normalization, prefixes and corpus hash. Incompatible assets are rejected before importing the embedding runtime. Fuzzy search remains available. Labs explicitly selects MiniLM; EmbeddingGemma remains the package default for existing consumers.

## Building the index

Use the canonical search export and rendered HTML from the **same local vd3-docs build**. The source checkout is read only. Install this sibling package's development dependencies for the CLI (`linkedom` and Transformers.js); they are not runtime dependencies of the browser library.

```bash
pnpm build
node scripts/vwl-hybrid-index.mjs --source-root ../../vd3/vd3-docs --out ../labs/data --presets minilm,embeddinggemma
```

`--input` overrides `dist/search/search-index.json`; `--html-dir` overrides `dist`. `--config` accepts `sourceRoot`, `input`, `htmlDir`, `outDir`, and `presets`. Downloaded navigation JavaScript is never executed; legacy `--nav` / `--site` options are rejected.

The manifest `search-manifest.json` points to an immutable `search/<generation>/` directory containing the corpus and both vector files. It records source revision/dirty state/content hash, corpus hash, model, dimensions, q8 dtype, mean pooling, normalization, prefixes, and asset hashes. Parsing or embedding failures leave the previous manifest intact. Hosts resolve the manifest and pass its URLs to the engine; see Labs' `src/lib/docs-search.js`.

HTML enrichment keeps verified section anchors, API rows, identifiers and bounded code examples. Fuzzy search is immediately usable after `initFuzzy()`. Call `initSemantic()` only after an explicit download action, and `dispose()` when the owner unmounts.

## API

### `new HybridSearch(options?)`

| Option | Default | Purpose |
| --- | --- | --- |
| `embeddingPreset` | `embeddinggemma` | Bundled model + dtype + prefixes |
| `indexUrl` | `./data/search-index.json` | Search corpus JSON |
| `vectorsUrl` | `./data/vectors.json` | Precomputed embeddings JSON |
| `fuseThreshold` | `0.45` | Fuse match threshold |
| `semanticThreshold` | `0.3` | Cosine similarity floor |
| `maxResults` | `20` | Cap on merged hits |
| `maxSemanticResults` | `10` | Cap on semantic hits before merge |
| `modelName` / `dtype` / `queryPrefix` | from preset | Override preset fields |
| `confidence` | enabled | Adaptive display cutoff; `false` to disable |
| `fuzzyMinScore` / `titleExactBoost` | `0` | Fuzzy quality tuning |
| `loadFuse` / `loadTransformers` | CDN import | Inject host libraries |
| `onnxWasmPaths` | unset | Same-origin ORT WASM directory |

### Methods

- `initFuzzy()` / `initSemantic()` — load index, Fuse, Transformers, vectors
- `fuzzySearch(query)` / `semanticSearch(query)` — individual layers
- `search(query, { mode })` — `'fuzzy' | 'semantic' | 'hybrid'` (default hybrid)
- `mergeResults(fuzzy, semantic, query?)` — score merge + dedupe + confidence filter
- `onSemanticProgress(cb)` — download/ready/error events
- `getDocuments()` / `getDocById(id)` / `isSemanticReady()`

Also exported: `EMBEDDING_PRESETS`, `prefixQuery`, `prefixDocument`, `filterConfidentHits`, guardrails from `.` and `./guardrails/search`.

## Tuning

| Knob | When to adjust |
| --- | --- |
| `fuseThreshold` | Lower (e.g. 0.3) for stricter character matching |
| `semanticThreshold` | Lower for EmbeddingGemma (e.g. 0.28) |
| `fuzzyMinScore` | Raise to drop weak fuzzy tail |
| `titleExactBoost` | Raise when exact title matches should win |
| `confidence.minTopScore` | Default 0.53 — raise to reduce noise |
| `confidence: false` | Disable adaptive cutoff entirely |

## CSP / offline

Under `script-src 'self'`, bundle `fuse.js` and `@huggingface/transformers` and set `onnxWasmPaths` to a same-origin WASM directory. CDN defaults use jsDelivr/unpkg.

## QA

```bash
pnpm test:ci      # unit + coverage (mocked loaders)
pnpm test:local   # + real MiniLM e2e (downloads model)
pnpm build
```

## License

MIT
