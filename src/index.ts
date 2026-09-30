export {
  HybridSearch,
  cosineSimilarity,
  rankBySimilarity,
  VWL_HYBRID_SEARCH_VERSION,
  DEFAULT_DOCS_BASE_URL,
} from './hybrid-search.js';

export type {
  HybridSearchOptions,
  SearchDocument,
  SearchResult,
  SearchMode,
  MergedHit,
  FuzzyHit,
  SemanticHit,
  SemanticProgress,
  TitleMatch,
} from './hybrid-search.js';

export {
  EMBEDDING_PRESETS,
  prefixQuery,
  prefixDocument,
  documentEmbedText,
  resolvePresetConfig,
  QUERY_PREFIX_GEMMA,
} from './embedding-presets.js';

export type { EmbeddingPresetId, EmbeddingPresetConfig } from './embedding-presets.js';

export { filterConfidentHits, adaptiveCutoff, DEFAULT_CONFIDENCE } from './confidence.js';

export type { ConfidenceOptions } from './confidence.js';

export {
  normalizeSearchQuery,
  validateSearchQuery,
  validateSearchIndexDocument,
  validateSearchIndexPayload,
  validateVectorPayload,
  safeDocHref,
  sanitizeIconClass,
  searchGuardrails,
  VD_GUARDRAILS_VERSION,
} from './guardrails/search.js';
