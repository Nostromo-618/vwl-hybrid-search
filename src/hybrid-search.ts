/**
 * @vanduo-oss/vwl-hybrid-search — VwlHybridSearch headless engine.
 * Fuzzy (Fuse.js) + semantic (Transformers.js) hybrid search.
 * Zero runtime npm dependencies; libraries load from CDN unless injectors are provided.
 */

import {
  normalizeSearchQuery,
  validateSearchIndexPayload,
  validateSearchQuery,
  validateVectorPayload,
} from './guardrails/search.js';
import { type ConfidenceOptions, DEFAULT_CONFIDENCE, filterConfidentHits } from './confidence.js';
import { type EmbeddingPresetId, prefixQuery, resolvePresetConfig } from './embedding-presets.js';

const CDN = {
  fuse: [
    'https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.basic.mjs',
    'https://unpkg.com/fuse.js@7/dist/fuse.basic.mjs',
  ],
  transformers: [
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4/+esm',
    'https://esm.sh/@huggingface/transformers@4',
  ],
};

export const VWL_HYBRID_SEARCH_VERSION = '0.2.0';

export const DEFAULT_DOCS_BASE_URL = 'https://vd3.vanduo.dev';

export type SearchDocument = {
  id: string;
  title: string;
  route: string;
  category?: string;
  icon?: string;
  tab?: string;
  keywords?: string[];
  headings?: string[];
  classes?: string[];
  chunks?: Array<{ text?: string; heading?: string; anchor?: string; code?: string[] }>;
  bodyText?: string;
  [key: string]: unknown;
};

export type SemanticProgress = {
  stage?: string;
  message?: string;
  progress?: { status?: string; loaded?: number; total?: number };
};

export type FuzzyHit = {
  item: SearchDocument;
  score: number;
};

export type SemanticHit = {
  id: string;
  score: number;
};

export type TitleMatch = 'exact' | 'partial' | 'none';

export type MergedHit = {
  doc: SearchDocument;
  score: number;
  source: 'fuzzy' | 'semantic';
  /** True when fuzzy title match is soft (not exact). Omitted for semantic hits. */
  weakMatch?: boolean;
  /** How the query relates to the doc title (fuzzy-sourced hits only). */
  titleMatch?: TitleMatch;
};

export type SearchMode = 'fuzzy' | 'semantic' | 'hybrid';

export type SearchResult = {
  query: string;
  mode: SearchMode;
  fuzzy: FuzzyHit[];
  semantic: SemanticHit[];
  merged: MergedHit[];
};

export type HybridSearchOptions = {
  indexUrl?: string;
  vectorsUrl?: string;
  fuseThreshold?: number;
  semanticThreshold?: number;
  maxResults?: number;
  /** Cap semantic hits before merge (default 10). */
  maxSemanticResults?: number;
  queryMinLength?: number;
  queryMaxLength?: number;
  maxDocuments?: number;
  maxVectorDimensions?: number;
  semanticBoost?: number;
  /**
   * Drop fuzzy merged hits whose final score is below this floor.
   * Default `0` preserves prior inclusion behavior.
   */
  fuzzyMinScore?: number;
  /**
   * Added to the fuzzy score when `titleMatch` is `exact`.
   * Default `0` preserves prior ranking.
   */
  titleExactBoost?: number;
  /** Bundled model + dtype + prefix strategy. Default `embeddinggemma`. */
  embeddingPreset?: EmbeddingPresetId;
  modelName?: string;
  /** Transformers.js v4 dtype (default from preset, usually `q8`). */
  dtype?: string;
  /** Prepended to queries before embedding. Overrides preset. */
  queryPrefix?: string;
  /** @deprecated Use `dtype` instead. Translated to `dtype: 'q8' | 'fp32'`. */
  quantized?: boolean;
  /**
   * Adaptive display cutoff applied in mergeResults.
   * Default: enabled with vd3-docs tuning. Pass `false` to disable.
   */
  confidence?: false | ConfidenceOptions;
  loadFuse?: () => Promise<unknown>;
  loadTransformers?: () => Promise<unknown>;
  /**
   * Same-origin directory URL for ONNX Runtime WASM assets used by
   * Transformers.js (e.g. `/transformers-wasm/`). Required under CSP
   * `script-src 'self'` — Transformers defaults to jsDelivr otherwise.
   */
  onnxWasmPaths?: string;
};

type VectorRow = { id: string; embedding: number[] };
type VectorPayload = {
  model?: string;
  source?: string;
  generatedAt?: string;
  dimensions?: number;
  schemaVersion?: number;
  corpusHash?: string;
  dtype?: string;
  pooling?: string;
  queryPrefix?: string;
  documentPrefix?: string;
  documents: VectorRow[];
};

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return Number.NaN;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export function rankBySimilarity(
  queryVec: number[],
  vectors: VectorRow[],
  threshold = 0.25,
): SemanticHit[] {
  return vectors
    .map((doc) => {
      const score = cosineSimilarity(queryVec, doc.embedding);
      return { id: doc.id, score };
    })
    .filter((r) => r.score > threshold && Number.isFinite(r.score))
    .sort((a, b) => b.score - a.score);
}

let _fuseModule: unknown = null;
let _transformersModule: unknown = null;

async function loadFuseDefault(): Promise<unknown> {
  if (_fuseModule) return _fuseModule;
  const urls = CDN.fuse;
  let lastErr: unknown;
  for (const url of urls) {
    try {
      _fuseModule = await import(/* @vite-ignore */ url);
      return _fuseModule;
    } catch (err) {
      lastErr = err;
    }
  }
  console.warn('[HybridSearch] Failed to load Fuse.js from any CDN:', (lastErr as Error)?.message);
  throw lastErr;
}

async function loadTransformersDefault(): Promise<unknown> {
  if (_transformersModule) return _transformersModule;
  const urls = CDN.transformers;
  let lastErr: unknown;
  for (const url of urls) {
    try {
      _transformersModule = await import(/* @vite-ignore */ url);
      return _transformersModule;
    } catch (err) {
      lastErr = err;
    }
  }
  console.warn(
    '[HybridSearch] Failed to load Transformers.js from any CDN:',
    (lastErr as Error)?.message,
  );
  throw lastErr;
}

function resolvePipelineDtype(options: HybridSearchOptions, presetDtype: string): string {
  if (typeof options.dtype === 'string' && options.dtype.trim()) return options.dtype.trim();
  if (typeof options.quantized === 'boolean') {
    return options.quantized ? 'q8' : 'fp32';
  }
  return presetDtype;
}

type FuseLike = {
  search: (query: string, opts?: { limit?: number }) => FuzzyHit[];
};

type FuseModule = {
  default?: new (docs: SearchDocument[], opts: Record<string, unknown>) => FuseLike;
} & (new (docs: SearchDocument[], opts: Record<string, unknown>) => FuseLike);

type Extractor = ((
  query: string,
  opts: { pooling: string; normalize: boolean },
) => Promise<{ data: ArrayLike<number> }> | { data: ArrayLike<number> }) & {
  dispose?: () => Promise<void>;
};

export class HybridSearch {
  static VERSION = VWL_HYBRID_SEARCH_VERSION;
  private _corpusHash?: string;
  private _disposed = false;

  indexUrl: string;
  vectorsUrl: string;
  fuseThreshold: number;
  semanticThreshold: number;
  maxResults: number;
  maxSemanticResults: number;
  queryMinLength: number;
  queryMaxLength: number;
  maxDocuments: number;
  maxVectorDimensions: number;
  semanticBoost: number;
  fuzzyMinScore: number;
  titleExactBoost: number;
  embeddingPreset: EmbeddingPresetId;
  modelName: string;
  dtype: string;
  queryPrefix: string;

  private _confidence: false | Required<ConfidenceOptions>;
  private _loadFuse: () => Promise<unknown>;
  private _loadTransformers: () => Promise<unknown>;
  private _onnxWasmPaths: string | null;
  private _fuse: FuseLike | null = null;
  private _fusePromise: Promise<void> | null = null;
  private _docs: SearchDocument[] | null = null;
  private _docMap: Map<string, SearchDocument> | null = null;
  private _vectors: VectorRow[] | null = null;
  private _extractor: Extractor | null = null;
  private _semanticReady = false;
  private _semanticFailed = false;
  private _semanticPromise: Promise<void> | null = null;
  private _progressSubscribers: Array<(data: SemanticProgress) => void> = [];

  constructor(options: HybridSearchOptions = {}) {
    const presetId = options.embeddingPreset ?? 'embeddinggemma';
    const preset = resolvePresetConfig(presetId);

    this.embeddingPreset = presetId;
    this.indexUrl = options.indexUrl ?? './data/search-index.json';
    this.vectorsUrl = options.vectorsUrl ?? './data/vectors.json';
    this.fuseThreshold = options.fuseThreshold ?? 0.45;
    this.semanticThreshold = options.semanticThreshold ?? 0.3;
    this.maxResults = options.maxResults ?? 20;
    this.maxSemanticResults = options.maxSemanticResults ?? 10;
    this.queryMinLength = options.queryMinLength ?? 2;
    this.queryMaxLength = options.queryMaxLength ?? 240;
    this.maxDocuments = options.maxDocuments ?? 5000;
    this.maxVectorDimensions = options.maxVectorDimensions ?? 4096;
    this.semanticBoost = options.semanticBoost ?? 1.0;
    this.fuzzyMinScore = options.fuzzyMinScore ?? 0;
    this.titleExactBoost = options.titleExactBoost ?? 0;
    this.modelName =
      options.modelName ?? preset?.modelName ?? 'onnx-community/embeddinggemma-300m-ONNX';
    this.dtype = resolvePipelineDtype(options, preset?.dtype ?? 'q8');
    this.queryPrefix = options.queryPrefix ?? preset?.queryPrefix ?? '';

    if (options.confidence === false) {
      this._confidence = false;
    } else {
      this._confidence = {
        ...DEFAULT_CONFIDENCE,
        ...(presetId === 'minilm' ? { minTopScore: 0.42 } : {}),
        ...options.confidence,
      };
    }

    this._loadFuse = typeof options.loadFuse === 'function' ? options.loadFuse : loadFuseDefault;
    this._loadTransformers =
      typeof options.loadTransformers === 'function'
        ? options.loadTransformers
        : loadTransformersDefault;
    this._onnxWasmPaths =
      typeof options.onnxWasmPaths === 'string' && options.onnxWasmPaths.trim()
        ? options.onnxWasmPaths.trim().replace(/\/?$/, '/')
        : null;
  }

  /** Apply CSP-safe ORT WASM paths before Transformers initializes ONNX. */
  private _applyOnnxWasmPaths(transformers: {
    env?: { backends?: { onnx?: { wasm?: { wasmPaths?: string } } } };
  }): void {
    if (!this._onnxWasmPaths) return;
    const wasm = transformers.env?.backends?.onnx?.wasm;
    if (wasm) {
      wasm.wasmPaths = this._onnxWasmPaths;
    }
  }

  onSemanticProgress(callback: (data: SemanticProgress) => void): () => void {
    this._progressSubscribers.push(callback);
    return () => {
      this._progressSubscribers = this._progressSubscribers.filter((cb) => cb !== callback);
    };
  }

  private _emitSemanticProgress(data: SemanticProgress): void {
    for (const cb of this._progressSubscribers) cb(data);
  }

  async initFuzzy(): Promise<void> {
    if (!this._fusePromise) {
      this._fusePromise = (async () => {
        const response = await fetch(this.indexUrl);
        if (!response.ok) throw new Error(`Failed to load search index: ${response.status}`);
        const data = (await response.json()) as {
          documents: SearchDocument[];
          corpusHash?: string;
        };
        const payloadCheck = validateSearchIndexPayload(data, {
          maxDocuments: this.maxDocuments,
        });
        if (!payloadCheck.allowed) {
          throw new Error(payloadCheck.message || 'Search index payload validation failed.');
        }
        this._corpusHash = data.corpusHash;
        this._docs = data.documents;
        this._docMap = new Map(this._docs.map((d) => [d.id, d]));

        const Fuse = (await this._loadFuse()) as FuseModule;
        const FuseClass = (Fuse.default ?? Fuse) as new (
          docs: SearchDocument[],
          opts: Record<string, unknown>,
        ) => FuseLike;
        this._fuse = new FuseClass(this._docs, {
          keys: [
            { name: 'title', weight: 2.5 },
            { name: 'headings', weight: 2.0 },
            { name: 'keywords', weight: 2.5 },
            { name: 'bodyText', weight: 1.0 },
            { name: 'classes', weight: 1.5 },
            { name: 'chunks.text', weight: 0.8 },
          ],
          threshold: this.fuseThreshold,
          includeScore: true,
          shouldSort: true,
          minMatchCharLength: 2,
        });
      })();
    }
    return this._fusePromise;
  }

  fuzzySearch(query: unknown): FuzzyHit[] {
    if (!this._fuse) return [];
    const normalizedQuery = normalizeSearchQuery(query, {
      maxLength: this.queryMaxLength,
    });
    const check = validateSearchQuery(normalizedQuery, {
      minLength: this.queryMinLength,
      maxLength: this.queryMaxLength,
    });
    if (!check.allowed) return [];
    return this._fuse.search(normalizedQuery, { limit: this.maxResults });
  }

  async initSemantic(): Promise<void> {
    if (this._disposed) throw new Error('Search was disposed.');
    await this.initFuzzy();
    if (this._semanticReady) return;
    if (this._semanticFailed) {
      throw new Error('Semantic search previously failed; recreate HybridSearch instance to retry');
    }

    if (!this._semanticPromise) {
      this._semanticPromise = (async () => {
        this._emitSemanticProgress({
          stage: 'loading-model',
          message: 'Loading search model (one-time download)...',
        });

        let vectorsData: VectorPayload;
        try {
          vectorsData = await fetch(this.vectorsUrl).then(async (r) => {
            if (!r.ok) throw new Error(`Failed to load vectors: ${r.status}`);
            return r.json() as Promise<VectorPayload>;
          });

          const vectorsCheck = validateVectorPayload(vectorsData, {
            maxDocuments: this.maxDocuments,
            maxDimensions: this.maxVectorDimensions,
          });
          if (!vectorsCheck.allowed) {
            throw new Error(vectorsCheck.message || 'Vector payload validation failed.');
          }

          const knownDocIds = new Set((this._docs || []).map((d) => d.id));
          const unknownVectorId = vectorsData.documents.find((row) => !knownDocIds.has(row.id));
          if (unknownVectorId) {
            throw new Error(`Vector payload references unknown doc id: ${unknownVectorId.id}`);
          }

          if (
            vectorsData.documents.length !== knownDocIds.size ||
            new Set(vectorsData.documents.map((r) => r.id)).size !== knownDocIds.size
          )
            throw new Error(
              'Vector set is incomplete or contains duplicate IDs. Fuzzy search remains available.',
            );
          const dimensions = vectorsData.documents[0].embedding.length;
          const preset = resolvePresetConfig(this.embeddingPreset);
          if (
            (vectorsData.model && vectorsData.model !== this.modelName) ||
            (vectorsData.dimensions && vectorsData.dimensions !== dimensions) ||
            (preset && preset.modelName === this.modelName && dimensions !== preset.dimensions)
          )
            throw new Error(
              'Embedding model or dimensions do not match the vectors. Fuzzy search remains available.',
            );
          if (this._corpusHash || vectorsData.schemaVersion) {
            const documentPrefix =
              this.embeddingPreset === 'embeddinggemma'
                ? 'title: {title} | text: '
                : this.embeddingPreset === 'e5'
                  ? 'passage: '
                  : '';
            if (
              !this._corpusHash ||
              vectorsData.corpusHash !== this._corpusHash ||
              vectorsData.model !== this.modelName ||
              vectorsData.dtype !== this.dtype ||
              vectorsData.pooling !== 'mean' ||
              vectorsData.queryPrefix !== this.queryPrefix ||
              vectorsData.documentPrefix !== documentPrefix
            )
              throw new Error(
                'Search corpus and embedding configuration do not match. Fuzzy search remains available.',
              );
          }
          const transformers = (await this._loadTransformers()) as {
            env?: { backends?: { onnx?: { wasm?: { wasmPaths?: string } } } };
            pipeline: (
              task: string,
              model: string,
              opts?: Record<string, unknown>,
            ) => Promise<Extractor> | Extractor;
          };
          this._applyOnnxWasmPaths(transformers);

          this._extractor = await transformers.pipeline('feature-extraction', this.modelName, {
            dtype: this.dtype,
            progress_callback: (progress: { status?: string; loaded?: number; total?: number }) => {
              if (progress?.status === 'progress' && progress.total) {
                this._emitSemanticProgress({
                  stage: 'downloading',
                  message: `Downloading model… ${Math.round(((progress.loaded || 0) / progress.total) * 100)}%`,
                  progress,
                });
              }
            },
          });

          if (this._disposed) {
            await this._extractor?.dispose?.();
            this._extractor = null;
            throw new Error('Search was disposed.');
          }
        } catch (err) {
          this._semanticFailed = true;
          this._semanticPromise = null;
          this._emitSemanticProgress({
            stage: 'error',
            message: (err as Error).message,
          });
          throw err;
        }

        this._vectors = vectorsData.documents;
        this._semanticReady = true;
        this._emitSemanticProgress({ stage: 'ready', message: 'Search model ready' });
      })();
    }
    return this._semanticPromise;
  }

  async semanticSearch(query: unknown): Promise<SemanticHit[]> {
    await this.initSemantic();
    const normalizedQuery = normalizeSearchQuery(query, {
      maxLength: this.queryMaxLength,
    });
    const check = validateSearchQuery(normalizedQuery, {
      minLength: this.queryMinLength,
      maxLength: this.queryMaxLength,
    });
    if (!check.allowed) return [];
    if (!this._extractor || !this._vectors) return [];

    const prefixedQuery = prefixQuery(normalizedQuery, this.queryPrefix);
    const output = await this._extractor(prefixedQuery, {
      pooling: 'mean',
      normalize: true,
    });
    const queryVec = Array.from(output.data);
    if (
      queryVec.length !== this._vectors[0].embedding.length ||
      queryVec.some((v) => !Number.isFinite(v))
    )
      throw new Error('Query embedding dimensions or values are invalid.');

    return rankBySimilarity(queryVec, this._vectors, this.semanticThreshold).slice(
      0,
      this.maxSemanticResults,
    );
  }

  async dispose(): Promise<void> {
    this._disposed = true;
    this._progressSubscribers = [];
    if (this._semanticPromise) await this._semanticPromise.catch(() => {});
    await this._extractor?.dispose?.();
    this._extractor = null;
    this._semanticReady = false;
  }

  /**
   * Classify how a query relates to a document title (case-insensitive).
   * - exact: normalized query equals normalized title
   * - partial: shared significant tokens or title contains query / query contains title
   * - none: otherwise
   */
  private _titleMatch(query: string, title: string): TitleMatch {
    const q = String(query || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const t = String(title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!q || !t) return 'none';
    if (q === t) return 'exact';
    if (t.includes(q) || q.includes(t)) return 'partial';
    const qTokens = q.split(' ').filter((tok) => tok.length >= 3);
    const tTokens = new Set(t.split(' ').filter((tok) => tok.length >= 3));
    if (qTokens.some((tok) => tTokens.has(tok))) return 'partial';
    return 'none';
  }

  /** Map a Fuse hit to a MergedHit with optional quality signals; null if below floor. */
  private _mapFuzzyHit(fr: FuzzyHit, query?: string): MergedHit | null {
    let score = 1 - fr.score;
    const hit: MergedHit = {
      doc: fr.item,
      score,
      source: 'fuzzy',
    };
    if (typeof query === 'string' && query.length > 0) {
      const titleMatch = this._titleMatch(query, String(fr.item?.title || ''));
      hit.titleMatch = titleMatch;
      hit.weakMatch = titleMatch !== 'exact';
      if (titleMatch === 'exact' && this.titleExactBoost) {
        score += this.titleExactBoost;
        hit.score = score;
      }
    }
    if (score < this.fuzzyMinScore) return null;
    return hit;
  }

  private _applyConfidence(hits: MergedHit[]): MergedHit[] {
    if (this._confidence === false) return hits;
    return filterConfidentHits(hits, this._confidence);
  }

  mergeResults(
    fuzzyResults: FuzzyHit[],
    semanticResults: SemanticHit[],
    query?: string,
  ): MergedHit[] {
    if (!this._docMap) throw new Error('mergeResults requires initFuzzy() to be called first');

    const boosted: MergedHit[] = [];
    for (const sr of semanticResults) {
      const doc = this._docMap!.get(sr.id);
      if (!doc) {
        console.warn(`[HybridSearch] Vector references missing doc id: '${sr.id}'`);
        continue;
      }
      boosted.push({
        doc,
        score: sr.score * this.semanticBoost,
        source: 'semantic',
      });
    }

    const fuzzyMapped: MergedHit[] = [];
    for (const fr of fuzzyResults) {
      const mapped = this._mapFuzzyHit(fr, query);
      if (mapped) fuzzyMapped.push(mapped);
    }

    const seen = new Set<string>();
    const merged: MergedHit[] = [];
    const all = [...boosted, ...fuzzyMapped].sort((a, b) => b.score - a.score);
    for (const r of all) {
      if (!seen.has(r.doc.id)) {
        seen.add(r.doc.id);
        merged.push(r);
      }
    }

    const capped = merged.slice(0, this.maxResults);
    return this._applyConfidence(capped);
  }

  async search(
    query: unknown,
    { mode = 'hybrid' }: { mode?: SearchMode } = {},
  ): Promise<SearchResult> {
    await this.initFuzzy();

    const normalizedQuery = normalizeSearchQuery(query, {
      maxLength: this.queryMaxLength,
    });
    const queryCheck = validateSearchQuery(normalizedQuery, {
      minLength: this.queryMinLength,
      maxLength: this.queryMaxLength,
    });

    if (!['fuzzy', 'semantic', 'hybrid'].includes(mode)) {
      throw new Error(`Invalid search mode: "${mode}". Expected 'fuzzy', 'semantic', or 'hybrid'.`);
    }

    const result: SearchResult = {
      query: normalizedQuery,
      mode,
      fuzzy: [],
      semantic: [],
      merged: [],
    };

    if (!queryCheck.allowed) return result;

    if (mode === 'fuzzy' || mode === 'hybrid') {
      result.fuzzy = this.fuzzySearch(normalizedQuery);
    }

    if (mode === 'semantic' || mode === 'hybrid') {
      try {
        result.semantic = await this.semanticSearch(normalizedQuery);
      } catch (err) {
        console.warn('[HybridSearch] Semantic search failed:', (err as Error).message);
      }
    }

    if (mode === 'hybrid') {
      result.merged = this.mergeResults(result.fuzzy, result.semantic, normalizedQuery);
    } else if (mode === 'fuzzy') {
      const fuzzyMerged: MergedHit[] = [];
      for (const fr of result.fuzzy) {
        const mapped = this._mapFuzzyHit(fr, normalizedQuery);
        if (mapped) fuzzyMerged.push(mapped);
      }
      result.merged = this._applyConfidence(fuzzyMerged.slice(0, this.maxResults));
    } else {
      const semanticMerged: MergedHit[] = [];
      for (const sr of result.semantic) {
        const doc = this._docMap!.get(sr.id);
        if (!doc) continue;
        semanticMerged.push({ doc, score: sr.score, source: 'semantic' });
      }
      result.merged = this._applyConfidence(semanticMerged);
    }

    return result;
  }

  getDocById(id: string): SearchDocument | null {
    return this._docMap?.get(id) ?? null;
  }

  getDocuments(): SearchDocument[] {
    return Array.isArray(this._docs) ? this._docs.slice() : [];
  }

  isSemanticReady(): boolean {
    return this._semanticReady;
  }

  static resetCDNCache(): void {
    _fuseModule = null;
    _transformersModule = null;
  }
}
