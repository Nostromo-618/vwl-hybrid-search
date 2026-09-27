import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fuse from 'fuse.js';
import {
  HybridSearch,
  cosineSimilarity,
  rankBySimilarity,
  VDL_HYBRID_SEARCH_VERSION,
  DEFAULT_DOCS_BASE_URL,
  EMBEDDING_PRESETS,
  prefixQuery,
  prefixDocument,
  documentEmbedText,
  filterConfidentHits,
  adaptiveCutoff,
  DEFAULT_CONFIDENCE,
  resolvePresetConfig,
  QUERY_PREFIX_GEMMA,
  type SearchDocument,
} from '../src/index.js';
import {
  normalizeSearchQuery,
  validateSearchQuery,
  validateSearchIndexDocument,
  validateSearchIndexPayload,
  validateVectorPayload,
  safeDocHref,
  sanitizeIconClass,
  searchGuardrails,
  VD_GUARDRAILS_VERSION,
} from '../src/guardrails/search.js';
import { allow, block, normalizeText, toGuardrailError } from '../src/guardrails/core.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const fixture = JSON.parse(
  readFileSync(join(root, 'tests/fixtures/curriculum-search-index.json'), 'utf8'),
);

const mockDocs = fixture.documents as SearchDocument[];

function makeVectors(docs = mockDocs, dims = 4) {
  return {
    documents: docs.map((d, i) => ({
      id: d.id,
      embedding: Array.from({ length: dims }, (_, j) => (j === i % dims ? 1 : 0)),
    })),
  };
}

function stubFetch(indexPayload: unknown = fixture, vectorsPayload: unknown = makeVectors()) {
  return vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('vectors')) {
        return { ok: true, json: async () => vectorsPayload };
      }
      return { ok: true, json: async () => indexPayload };
    }),
  );
}

function createSearch(overrides: ConstructorParameters<typeof HybridSearch>[0] = {}) {
  return new HybridSearch({
    indexUrl: 'https://example.test/index.json',
    vectorsUrl: 'https://example.test/vectors.json',
    loadFuse: async () => ({ default: Fuse }),
    loadTransformers: async () => {
      throw new Error('semantic unavailable');
    },
    confidence: false,
    embeddingPreset: 'none',
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  HybridSearch.resetCDNCache();
});

describe('smoke', () => {
  it('version matches package.json', () => {
    expect(VDL_HYBRID_SEARCH_VERSION).toBe(pkg.version);
    expect(HybridSearch.VERSION).toBe(pkg.version);
    expect(DEFAULT_DOCS_BASE_URL).toContain('vd3.vanduo.dev');
    expect(VD_GUARDRAILS_VERSION).toBeTruthy();
  });
});

describe('embedding presets', () => {
  it('exports preset table with expected models', () => {
    expect(EMBEDDING_PRESETS.embeddinggemma.modelName).toContain('embeddinggemma');
    expect(EMBEDDING_PRESETS.minilm.dimensions).toBe(384);
    expect(EMBEDDING_PRESETS.e5.queryPrefix).toBe('query: ');
  });

  it('prefixQuery and prefixDocument apply preset rules', () => {
    expect(prefixQuery('hello', 'query: ')).toBe('query: hello');
    expect(prefixQuery('query: already', 'query: ')).toBe('query: already');
    expect(prefixQuery('task: x', 'query: ')).toBe('task: x');
    expect(prefixDocument('Title', 'body', { preset: 'embeddinggemma' })).toBe(
      'title: Title | text: body',
    );
    expect(prefixDocument('Title', 'body', { preset: 'e5' })).toBe('passage: Title. body');
    expect(prefixDocument('Title', 'body', { preset: 'minilm' })).toBe('body');
    expect(prefixDocument('Title', 'body', { queryPrefix: QUERY_PREFIX_GEMMA })).toBe(
      'title: Title | text: body',
    );
    expect(documentEmbedText({ keywords: ['a'], headings: ['h'], bodyText: 'b' })).toContain('b');
    expect(resolvePresetConfig('none')).toBeNull();
    expect(resolvePresetConfig('minilm')?.modelName).toContain('MiniLM');
  });
});

describe('confidence', () => {
  it('adaptiveCutoff and filterConfidentHits trim weak tails', () => {
    expect(adaptiveCutoff(0.8, DEFAULT_CONFIDENCE)).toBeCloseTo(0.36, 2);
    expect(adaptiveCutoff(0, DEFAULT_CONFIDENCE)).toBe(DEFAULT_CONFIDENCE.absFloor);
    const hits = filterConfidentHits([
      { doc: mockDocs[0], score: 0.9, source: 'semantic' },
      { doc: mockDocs[1], score: 0.2, source: 'semantic' },
    ]);
    expect(hits).toHaveLength(1);
    const weakFuzzy = filterConfidentHits([
      { doc: mockDocs[0], score: 0.9, source: 'semantic' },
      {
        doc: mockDocs[1],
        score: 0.5,
        source: 'fuzzy',
        weakMatch: true,
        titleMatch: 'none',
      },
    ]);
    expect(weakFuzzy).toHaveLength(1);
    expect(weakFuzzy[0].source).toBe('semantic');
    expect(filterConfidentHits([])).toEqual([]);
    expect(filterConfidentHits([{ doc: mockDocs[0], score: 0.4, source: 'semantic' }])).toEqual([]);
  });
});

describe('math helpers', () => {
  it('cosineSimilarity of identical vectors is 1', () => {
    const vec = [0.5, 0.5, 0.5, 0.5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
  });

  it('cosineSimilarity handles orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('rankBySimilarity filters and sorts', () => {
    const ranked = rankBySimilarity(
      [1, 0, 0],
      [
        { id: 'a', embedding: [0.9, 0.1, 0] },
        { id: 'b', embedding: [0.1, 0.9, 0] },
        { id: 'c', embedding: [0.5, 0.5, 0] },
      ],
      0.3,
    );
    expect(ranked.length).toBe(2);
    expect(ranked[0].id).toBe('a');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('rankBySimilarity drops non-finite scores', () => {
    const ranked = rankBySimilarity(
      [1, 0],
      [
        { id: 'ok', embedding: [1, 0] },
        { id: 'bad', embedding: [Number.NaN, 0] },
      ],
      0.1,
    );
    expect(ranked.map((r) => r.id)).toEqual(['ok']);
  });
});

describe('guardrails core', () => {
  it('normalizeText collapses whitespace and handles nullish', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText('  a   b  ')).toBe('a b');
  });

  it('allow/block/toGuardrailError shape results', () => {
    expect(allow()).toEqual({ allowed: true });
    expect(allow({ n: 1 }).meta).toEqual({ n: 1 });
    const blocked = block({
      code: 'x',
      message: 'nope',
      matchedPatternIds: ['p1'],
      meta: { a: 1 },
    });
    expect(blocked.allowed).toBe(false);
    const err = toGuardrailError(blocked);
    expect(err.name).toBe('GuardrailError');
    expect(err.code).toBe('x');
    expect(err.guardrail).toBe(blocked);
    expect(toGuardrailError({ allowed: false }).code).toBe('guardrail.blocked');
  });
});

describe('search guardrails', () => {
  it('normalizeSearchQuery trims and truncates', () => {
    expect(normalizeSearchQuery('  hello  world  ')).toBe('hello world');
    expect(normalizeSearchQuery('abcdef', { maxLength: 3 })).toBe('abc');
  });

  it('rejects empty, short, long, and pathological queries', () => {
    expect(validateSearchQuery('').allowed).toBe(false);
    expect(validateSearchQuery('a').allowed).toBe(false);
    expect(validateSearchQuery('ab').allowed).toBe(true);
    expect(validateSearchQuery('x'.repeat(241)).allowed).toBe(false);
    expect(validateSearchQuery('a'.repeat(20)).code).toBe('search.query.pathological');
    expect(searchGuardrails.validateSearchQuery('ok').allowed).toBe(true);
  });

  it('validates index documents thoroughly', () => {
    expect(validateSearchIndexDocument(null).allowed).toBe(false);
    expect(validateSearchIndexDocument({}).code).toBe('search.doc.id');
    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: '/ok',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).allowed,
    ).toBe(true);

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: 'components/button',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).allowed,
    ).toBe(true);

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: 'https://evil.example',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).allowed,
    ).toBe(false);

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: '/ok',
        icon: 'bad icon!',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).code,
    ).toBe('search.doc.icon');

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: '/ok',
        keywords: 'nope',
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).code,
    ).toBe('search.doc.arrays');

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: '/ok',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'x'.repeat(12001),
      }).code,
    ).toBe('search.doc.body');
  });

  it('validates index payloads for shape, empty, duplicates, and max', () => {
    expect(validateSearchIndexPayload(null).allowed).toBe(false);
    expect(validateSearchIndexPayload({ documents: [] }).code).toBe('search.index.empty');
    expect(validateSearchIndexPayload(fixture).allowed).toBe(true);
    expect(validateSearchIndexPayload(fixture, { maxDocuments: 1 }).code).toBe(
      'search.index.too_many_docs',
    );
    expect(
      validateSearchIndexPayload({
        documents: [mockDocs[0], { ...mockDocs[0] }],
      }).code,
    ).toBe('search.index.duplicate_id');
  });

  it('validates vector payloads thoroughly', () => {
    expect(validateVectorPayload(null).allowed).toBe(false);
    expect(validateVectorPayload({ documents: [] }).code).toBe('search.vectors.empty');
    expect(validateVectorPayload(makeVectors()).allowed).toBe(true);
    expect(validateVectorPayload(makeVectors(), { maxDocuments: 1 }).code).toBe(
      'search.vectors.too_many_docs',
    );
    expect(
      validateVectorPayload({
        documents: [{ id: 'a', embedding: [1] }],
      }).code,
    ).toBe('search.vectors.dimension');
    expect(
      validateVectorPayload({
        documents: [
          { id: 'a', embedding: [1, 0] },
          { id: 'b', embedding: [1, 0, 0] },
        ],
      }).code,
    ).toBe('search.vectors.dimension_mismatch');
    expect(
      validateVectorPayload({
        documents: [{ id: 'a', embedding: [1, Number.NaN] }],
      }).code,
    ).toBe('search.vectors.non_finite');
    expect(
      validateVectorPayload({
        documents: [{ id: 1, embedding: [1, 0] }],
      }).code,
    ).toBe('search.vectors.row_shape');
  });

  it('safeDocHref and sanitizeIconClass harden outputs', () => {
    expect(safeDocHref('https://docs.example/base/', '/components/button')).toBe(
      'https://docs.example/base/components/button',
    );
    expect(safeDocHref('https://docs.example/base', '/')).toBe('https://docs.example/base/');
    expect(safeDocHref('https://docs.example', 'legacy/route')).toBe(
      'https://docs.example/#legacy/route',
    );
    expect(safeDocHref('ftp://bad', '/ok')).toContain('vd3.vanduo.dev');
    expect(safeDocHref('not a url', '/ok')).toContain('vd3.vanduo.dev');
    expect(safeDocHref('https://docs.example', '')).toBe('#');
    expect(safeDocHref('https://docs.example', '../escape')).toBe('#');
    expect(safeDocHref('https://docs.example', 'bad:route')).toBe('#');
    expect(safeDocHref('https://docs.example', '/bad?x=1')).toBe('#');
    expect(sanitizeIconClass('ph-git-branch')).toBe('git-branch');
    expect(sanitizeIconClass('!!!')).toBe('file-text');
    expect(sanitizeIconClass(null)).toBe('file-text');
  });
});

describe('HybridSearch', () => {
  it('applies constructor defaults and custom options', () => {
    const defaults = new HybridSearch();
    expect(defaults.indexUrl).toBe('./data/search-index.json');
    expect(defaults.vectorsUrl).toBe('./data/vectors.json');
    expect(defaults.fuseThreshold).toBe(0.45);
    expect(defaults.modelName).toBe('onnx-community/embeddinggemma-300m-ONNX');
    expect(defaults.embeddingPreset).toBe('embeddinggemma');
    expect(defaults.dtype).toBe('q8');
    expect(defaults.maxSemanticResults).toBe(10);
    expect(defaults.fuzzyMinScore).toBe(0);
    expect(defaults.titleExactBoost).toBe(0);

    const custom = createSearch({
      embeddingPreset: 'minilm',
      fuseThreshold: 0.2,
      semanticThreshold: 0.1,
      maxResults: 5,
      maxSemanticResults: 3,
      queryMinLength: 3,
      queryMaxLength: 100,
      maxDocuments: 10,
      maxVectorDimensions: 8,
      semanticBoost: 2,
      fuzzyMinScore: 0.5,
      titleExactBoost: 0.2,
      modelName: 'custom/model',
      dtype: 'fp32',
    });
    expect(custom.fuseThreshold).toBe(0.2);
    expect(custom.semanticBoost).toBe(2);
    expect(custom.fuzzyMinScore).toBe(0.5);
    expect(custom.titleExactBoost).toBe(0.2);
    expect(custom.modelName).toBe('custom/model');
    expect(custom.maxSemanticResults).toBe(3);
    expect(custom.dtype).toBe('fp32');

    expect(new HybridSearch({ quantized: false }).dtype).toBe('fp32');
    expect(new HybridSearch({ quantized: true }).dtype).toBe('q8');
    expect(new HybridSearch({ embeddingPreset: 'none', modelName: 'custom/only' }).modelName).toBe(
      'custom/only',
    );
  });

  it('initFuzzy loads index, rejects bad payloads, and exposes docs', async () => {
    stubFetch();
    const search = createSearch();
    await search.initFuzzy();
    expect(search.getDocuments()).toHaveLength(mockDocs.length);
    expect(search.getDocById(mockDocs[0].id)?.title).toBe(mockDocs[0].title);
    expect(search.getDocById('missing')).toBeNull();
    expect(search.isSemanticReady()).toBe(false);

    vi.unstubAllGlobals();
    stubFetch({ documents: [] });
    const bad = createSearch();
    await expect(bad.initFuzzy()).rejects.toThrow(/empty|validation/i);
  });

  it('initFuzzy throws on non-ok fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    const search = createSearch();
    await expect(search.initFuzzy()).rejects.toThrow(/Failed to load search index: 500/);
  });

  it('fuzzySearch returns [] before init and for invalid queries', async () => {
    const search = createSearch();
    expect(search.fuzzySearch('narrowing')).toEqual([]);
    stubFetch();
    await search.initFuzzy();
    expect(search.fuzzySearch('a')).toEqual([]);
    expect(search.fuzzySearch('narrowing').length).toBeGreaterThan(0);
  });

  it('mergeResults requires init, warns on missing semantic docs, and dedupes', async () => {
    const search = createSearch({ maxResults: 2, semanticBoost: 2 });
    expect(() => search.mergeResults([], [])).toThrow(/initFuzzy/);

    (search as unknown as { _docs: unknown; _docMap: Map<string, unknown> })._docs = mockDocs;
    (search as unknown as { _docMap: Map<string, unknown> })._docMap = new Map(
      mockDocs.map((d) => [d.id, d]),
    );

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const merged = search.mergeResults(
      [
        { item: mockDocs[0], score: 0.1 },
        { item: mockDocs[1], score: 0.2 },
      ],
      [
        { id: mockDocs[0].id, score: 0.9 },
        { id: 'ghost', score: 0.95 },
      ],
    );
    expect(merged.length).toBe(2);
    expect(merged[0].source).toBe('semantic');
    expect(merged[0].score).toBeCloseTo(1.8);
    expect(warn).toHaveBeenCalled();
  });

  it('onSemanticProgress subscribes and unsubscribes', async () => {
    const events: string[] = [];
    const wasmEnv = { wasmPaths: 'https://cdn.example/default/' };
    stubFetch();
    const search = createSearch({
      onnxWasmPaths: '/transformers-wasm',
      loadTransformers: async () => ({
        env: { backends: { onnx: { wasm: wasmEnv } } },
        pipeline: async (
          _task: string,
          _model: string,
          opts?: {
            progress_callback?: (progress: {
              status?: string;
              loaded?: number;
              total?: number;
            }) => void;
          },
        ) => {
          opts?.progress_callback?.({ status: 'progress', loaded: 50, total: 100 });
          return async () => ({ data: [1, 0, 0, 0] });
        },
      }),
    });
    const off = search.onSemanticProgress((d) => {
      if (d.stage) events.push(d.stage);
    });
    await search.initSemantic();
    expect(events).toContain('loading-model');
    expect(events).toContain('downloading');
    expect(events).toContain('ready');
    expect(wasmEnv.wasmPaths).toBe('/transformers-wasm/');
    off();
    search.onSemanticProgress(() => {});
  });

  it('skips onnxWasmPaths when unset or when wasm env missing', async () => {
    stubFetch();
    const search = createSearch({
      loadTransformers: async () => ({
        env: {},
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await search.initSemantic();
    expect(search.isSemanticReady()).toBe(true);
  });

  it('initSemantic validates vectors and unknown ids', async () => {
    stubFetch(fixture, {
      documents: [{ id: 'ghost', embedding: [1, 0, 0, 0] }],
    });
    const search = createSearch({
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await expect(search.initSemantic()).rejects.toThrow(/unknown doc id/);
    expect(search.isSemanticReady()).toBe(false);
    await expect(search.initSemantic()).rejects.toThrow(/previously failed/);
  });

  it('initSemantic fails on vector fetch/validation errors and emits error progress', async () => {
    const events: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('vectors')) {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        return { ok: true, json: async () => fixture };
      }),
    );
    const search = createSearch({
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    search.onSemanticProgress((d) => {
      if (d.stage) events.push(d.stage);
    });
    await expect(search.initSemantic()).rejects.toThrow(/Failed to load vectors: 404/);
    expect(events).toContain('error');
  });

  it('initSemantic rejects invalid vector payload', async () => {
    stubFetch(fixture, { documents: [] });
    const search = createSearch({
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await expect(search.initSemantic()).rejects.toThrow(/empty|validation/i);
  });

  it('semanticSearch returns ranked hits and rejects invalid queries', async () => {
    stubFetch();
    const search = createSearch({
      semanticThreshold: 0.1,
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await search.initSemantic();
    expect(await search.semanticSearch('a')).toEqual([]);
    const hits = await search.semanticSearch('truthiness');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(mockDocs[0].id);
  });

  it('search fuzzy/hybrid/semantic modes and invalid mode', async () => {
    stubFetch();
    const search = createSearch({
      semanticThreshold: 0.1,
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });

    const empty = await search.search('a', { mode: 'fuzzy' });
    expect(empty.merged).toEqual([]);

    const fuzzy = await search.search(mockDocs[0].title.slice(0, 12), { mode: 'fuzzy' });
    expect(fuzzy.mode).toBe('fuzzy');
    expect(fuzzy.merged[0].source).toBe('fuzzy');

    const hybrid = await search.search('truthiness', { mode: 'hybrid' });
    expect(hybrid.merged.length).toBeGreaterThan(0);
    expect(hybrid.semantic.length).toBeGreaterThan(0);

    const semantic = await search.search('truthiness', { mode: 'semantic' });
    expect(semantic.merged.every((m) => m.source === 'semantic')).toBe(true);

    await expect(search.search('ok', { mode: 'nope' as 'fuzzy' })).rejects.toThrow(
      /Invalid search mode/,
    );
  });

  it('hybrid search degrades gracefully when semantic fails', async () => {
    stubFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const search = createSearch({
      loadTransformers: async () => {
        throw new Error('boom semantic');
      },
    });
    const result = await search.search(mockDocs[0].title.slice(0, 12), { mode: 'hybrid' });
    expect(result.fuzzy.length).toBeGreaterThan(0);
    expect(result.semantic).toEqual([]);
    expect(result.merged.length).toBeGreaterThan(0);
    expect(result.merged[0].source).toBe('fuzzy');
    expect(warn).toHaveBeenCalled();
  });

  it('marks getting-started near-miss titles as weak partial matches', async () => {
    stubFetch();
    const search = createSearch();
    await search.initFuzzy();

    // "getting started" fuzzy-ranks the near-miss title (same dogfood failure mode).
    const result = await search.search('getting started', { mode: 'fuzzy' });
    const nearMiss = result.merged.find((m) => m.doc.id === 'installing-types');
    const starter = result.merged.find((m) => m.doc.id === 'getting-started');

    expect(nearMiss).toBeTruthy();
    expect(nearMiss?.source).toBe('fuzzy');
    expect(nearMiss?.titleMatch).toBe('partial');
    expect(nearMiss?.weakMatch).toBe(true);

    expect(starter).toBeTruthy();
    expect(starter?.titleMatch).toBe('exact');
    expect(starter?.weakMatch).toBe(false);

    const exact = await search.search('Getting Started', { mode: 'fuzzy' });
    const exactHit = exact.merged.find((m) => m.doc.id === 'getting-started');
    expect(exactHit?.titleMatch).toBe('exact');
    expect(exactHit?.weakMatch).toBe(false);
  });

  it('applies fuzzyMinScore and titleExactBoost without changing defaults', async () => {
    stubFetch();
    const baseline = createSearch();
    await baseline.initFuzzy();
    const baselineMerged = await baseline.search('Getting Started', { mode: 'fuzzy' });
    expect(baseline.fuzzyMinScore).toBe(0);
    expect(baseline.titleExactBoost).toBe(0);

    const boosted = createSearch({ titleExactBoost: 0.5 });
    await boosted.initFuzzy();
    const boostedMerged = await boosted.search('Getting Started', { mode: 'fuzzy' });
    const baseExact = baselineMerged.merged.find((m) => m.doc.id === 'getting-started');
    const boostExact = boostedMerged.merged.find((m) => m.doc.id === 'getting-started');
    expect(baseExact).toBeTruthy();
    expect(boostExact).toBeTruthy();
    expect(boostExact!.score).toBeCloseTo(baseExact!.score + 0.5, 5);

    const filtered = createSearch({ fuzzyMinScore: 0.999 });
    await filtered.initFuzzy();
    const filteredMerged = await filtered.search('TypeScript getting started', { mode: 'fuzzy' });
    expect(filteredMerged.merged.every((m) => m.score >= 0.999)).toBe(true);
  });

  it('mergeResults optional query enables title signals on fuzzy hits', async () => {
    const search = createSearch();
    (search as unknown as { _docs: unknown; _docMap: Map<string, unknown> })._docs = mockDocs;
    (search as unknown as { _docMap: Map<string, unknown> })._docMap = new Map(
      mockDocs.map((d) => [d.id, d]),
    );
    const starter = mockDocs.find((d) => d.id === 'getting-started')!;
    const nearMiss = mockDocs.find((d) => d.id === 'installing-types')!;
    const merged = search.mergeResults(
      [
        { item: starter, score: 0.05 },
        { item: nearMiss, score: 0.2 },
      ],
      [],
      'Getting Started',
    );
    expect(merged.find((m) => m.doc.id === 'getting-started')?.titleMatch).toBe('exact');
    expect(merged.find((m) => m.doc.id === 'installing-types')?.titleMatch).toBe('partial');
    expect(merged.find((m) => m.doc.id === 'installing-types')?.weakMatch).toBe(true);

    const withoutQuery = search.mergeResults([{ item: starter, score: 0.05 }], []);
    expect(withoutQuery[0].titleMatch).toBeUndefined();
    expect(withoutQuery[0].weakMatch).toBeUndefined();
  });

  it('semantic-only mode skips missing docs in merged mapping', async () => {
    stubFetch();
    const search = createSearch({
      semanticThreshold: 0.1,
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await search.initSemantic();
    (search as unknown as { _vectors: Array<{ id: string; embedding: number[] }> })._vectors = [
      { id: 'ghost', embedding: [1, 0, 0, 0] },
      { id: mockDocs[0].id, embedding: [0.9, 0.1, 0, 0] },
    ];
    const result = await search.search('truthiness', { mode: 'semantic' });
    expect(result.merged.every((m) => m.doc.id !== 'ghost')).toBe(true);
  });

  it('ignores blank onnxWasmPaths and normalizes trailing slash', async () => {
    const wasmEnv = { wasmPaths: 'default' };
    stubFetch();
    const blank = createSearch({
      onnxWasmPaths: '   ',
      loadTransformers: async () => ({
        env: { backends: { onnx: { wasm: wasmEnv } } },
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await blank.initSemantic();
    expect(wasmEnv.wasmPaths).toBe('default');

    HybridSearch.resetCDNCache();
    const withSlash = createSearch({
      onnxWasmPaths: '/wasm',
      loadTransformers: async () => ({
        env: { backends: { onnx: { wasm: wasmEnv } } },
        pipeline: async () => {
          expect(wasmEnv.wasmPaths).toBe('/wasm/');
          return async () => ({ data: [1, 0, 0, 0] });
        },
      }),
    });
    await withSlash.initSemantic();
  });

  it('CDN default loaders warn and throw when all URLs fail', async () => {
    HybridSearch.resetCDNCache();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const search = new HybridSearch({
      indexUrl: 'https://example.test/index.json',
      vectorsUrl: 'https://example.test/vectors.json',
      confidence: false,
    });
    stubFetch();
    await expect(search.initFuzzy()).rejects.toThrow();
    expect(warn).toHaveBeenCalled();

    HybridSearch.resetCDNCache();
    const semantic = new HybridSearch({
      indexUrl: 'https://example.test/index.json',
      vectorsUrl: 'https://example.test/vectors.json',
      loadFuse: async () => ({ default: Fuse }),
      confidence: false,
    });
    await expect(semantic.initSemantic()).rejects.toThrow();
  });

  it('rejects incompatible vectors before importing or downloading the runtime', async () => {
    stubFetch(fixture, { ...makeVectors(), model: 'different/model' });
    const loader = vi.fn();
    const search = createSearch({ loadTransformers: loader });
    await expect(search.initSemantic()).rejects.toThrow(/do not match/);
    expect(loader).not.toHaveBeenCalled();
    expect((await search.search('truthiness', { mode: 'fuzzy' })).merged.length).toBeGreaterThan(0);
  });

  it('applies query prefix in semanticSearch', async () => {
    let captured = '';
    stubFetch();
    const search = createSearch({
      queryPrefix: 'task: search result | query: ',
      semanticThreshold: 0.1,
      loadTransformers: async () => ({
        pipeline: async () => async (text: string) => {
          captured = text;
          return { data: [1, 0, 0, 0] };
        },
      }),
    });
    await search.initSemantic();
    await search.semanticSearch('hello world');
    expect(captured).toBe('task: search result | query: hello world');
  });

  it('respects maxSemanticResults cap', async () => {
    stubFetch();
    const search = createSearch({
      maxSemanticResults: 1,
      semanticThreshold: 0.01,
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 1, 1, 1] }),
      }),
    });
    await search.initSemantic();
    const hits = await search.semanticSearch('truthiness');
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  it('filters low-confidence merged hits by default', async () => {
    const search = new HybridSearch({
      indexUrl: 'https://example.test/index.json',
      vectorsUrl: 'https://example.test/vectors.json',
      loadFuse: async () => ({ default: Fuse }),
      loadTransformers: async () => {
        throw new Error('semantic unavailable');
      },
    });
    (search as unknown as { _docs: unknown; _docMap: Map<string, unknown> })._docs = mockDocs;
    (search as unknown as { _docMap: Map<string, unknown> })._docMap = new Map(
      mockDocs.map((d) => [d.id, d]),
    );
    const weakOnly = search.mergeResults([{ item: mockDocs[1], score: 0.95 }], [], 'zzzz');
    expect(weakOnly).toEqual([]);

    const strong = search.mergeResults(
      [{ item: mockDocs[0], score: 0.05 }],
      [{ id: mockDocs[0].id, score: 0.9 }],
      'truthiness',
    );
    expect(strong.length).toBeGreaterThan(0);

    const withConfidenceOff = createSearch({ confidence: false });
    (withConfidenceOff as unknown as { _docs: unknown; _docMap: Map<string, unknown> })._docs =
      mockDocs;
    (withConfidenceOff as unknown as { _docMap: Map<string, unknown> })._docMap = new Map(
      mockDocs.map((d) => [d.id, d]),
    );
    const unfiltered = withConfidenceOff.mergeResults(
      [{ item: mockDocs[1], score: 0.95 }],
      [],
      'zzzz',
    );
    expect(unfiltered.length).toBeGreaterThan(0);
  });
});

describe('coherent assets and lifecycle', () => {
  const corpus = { ...fixture, corpusHash: 'same-corpus' };
  const payload = () => ({
    ...makeVectors(mockDocs, 384),
    schemaVersion: 1,
    model: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    dtype: 'q8',
    pooling: 'mean',
    queryPrefix: '',
    documentPrefix: '',
    corpusHash: 'same-corpus',
  });
  it.each([
    { dimensions: 768 },
    { model: 'wrong' },
    { corpusHash: 'old-corpus' },
    { dtype: 'fp32' },
    { pooling: 'cls' },
    { queryPrefix: 'wrong' },
    { documentPrefix: 'wrong' },
  ])('rejects metadata mismatch %# before downloading', async (patch) => {
    stubFetch(corpus, { ...payload(), ...patch });
    const loader = vi.fn();
    const search = createSearch({ embeddingPreset: 'minilm', loadTransformers: loader });
    await expect(search.initSemantic()).rejects.toThrow(/do not match/);
    expect(loader).not.toHaveBeenCalled();
  });
  it('rejects default Gemma loading legacy MiniLM vectors', async () => {
    stubFetch(fixture, makeVectors(mockDocs, 384));
    const loader = vi.fn();
    const search = createSearch({ embeddingPreset: 'embeddinggemma', loadTransformers: loader });
    await expect(search.initSemantic()).rejects.toThrow(/dimensions/);
    expect(loader).not.toHaveBeenCalled();
  });
  it('rejects duplicate or incomplete rows', async () => {
    for (const documents of [
      makeVectors().documents.slice(1),
      [makeVectors().documents[0], makeVectors().documents[0]],
    ]) {
      stubFetch(fixture, { documents });
      await expect(createSearch().initSemantic()).rejects.toThrow(/incomplete/);
    }
  });
  it('validates query dimensions and disposes the extractor', async () => {
    stubFetch(corpus, payload());
    const dispose = vi.fn();
    const extractor = Object.assign(
      vi.fn(async () => ({ data: new Float32Array(4) })),
      { dispose },
    );
    const search = createSearch({
      embeddingPreset: 'minilm',
      loadTransformers: async () => ({ pipeline: () => extractor }),
    });
    await search.initSemantic();
    await expect(search.semanticSearch('valid question')).rejects.toThrow(/Query embedding/);
    await search.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    await expect(search.initSemantic()).rejects.toThrow(/disposed/);
    expect(cosineSimilarity([1], [1, 2])).toBeNaN();
    expect(cosineSimilarity([], [])).toBeNaN();
  });
  it('releases a model whose load finishes after disposal', async () => {
    stubFetch();
    let done!: (value: unknown) => void;
    const dispose = vi.fn();
    const search = createSearch({
      loadTransformers: async () => ({
        pipeline: () =>
          new Promise((resolve) => {
            done = resolve;
          }),
      }),
    });
    const loading = search.initSemantic();
    await vi.waitFor(() => expect(done).toBeDefined());
    const closing = search.dispose();
    done(Object.assign(async () => ({ data: [1, 0, 0, 0] }), { dispose }));
    await expect(loading).rejects.toThrow(/disposed/);
    await closing;
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
