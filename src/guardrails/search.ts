import { allow, block, normalizeText, type GuardrailResult } from './core.js';

export { VD_GUARDRAILS_VERSION } from './core.js';

const SAFE_ICON_RE = /^[a-z0-9-]{1,64}$/i;
/** Legacy hash-route ids (no leading slash). */
const SAFE_HASH_ROUTE_RE = /^[a-z0-9/_-]{1,240}$/i;
/** Path routes for vd3-docs (`/` or `/components/button`). */
const SAFE_PATH_ROUTE_RE = /^\/(?:[a-z0-9/_-]{0,239})$/i;
const DEFAULT_DOCS_BASE = 'https://vd3.vanduo.dev';

export type SearchIndexDocument = {
  id: string;
  title: string;
  category: string;
  route: string;
  icon?: string;
  keywords: unknown[];
  headings: unknown[];
  classes: unknown[];
  chunks: unknown[];
  bodyText: string;
  [key: string]: unknown;
};

export function normalizeSearchQuery(query: unknown, options: { maxLength?: number } = {}): string {
  const maxLength = options.maxLength ?? 240;
  return normalizeText(query).slice(0, maxLength);
}

export function validateSearchQuery(
  query: unknown,
  options: { minLength?: number; maxLength?: number } = {},
): GuardrailResult {
  const minLength = options.minLength ?? 2;
  const maxLength = options.maxLength ?? 240;
  const normalized = normalizeSearchQuery(query, { maxLength: maxLength + 64 });

  if (!normalized) {
    return block({ code: 'search.query.empty', message: 'Query cannot be empty.' });
  }
  if (normalized.length < minLength) {
    return block({
      code: 'search.query.too_short',
      message: `Query must be at least ${minLength} characters.`,
      meta: { minLength, actualLength: normalized.length },
    });
  }
  if (normalized.length > maxLength) {
    return block({
      code: 'search.query.too_long',
      message: `Query is too long (max ${maxLength} characters).`,
      meta: { maxLength, actualLength: normalized.length },
    });
  }
  if (/(.)\1{19,}/.test(normalized)) {
    return block({
      code: 'search.query.pathological',
      message: 'Query appears malformed (repeated character sequence).',
    });
  }

  return allow({ normalizedQuery: normalized });
}

function asBoundedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > maxLen) return null;
  return v;
}

export function validateSearchIndexDocument(doc: unknown): GuardrailResult {
  if (!doc || typeof doc !== 'object') {
    return block({ code: 'search.doc.invalid_type', message: 'Document must be an object.' });
  }

  const record = doc as Record<string, unknown>;
  const id = asBoundedString(record.id, 120);
  const title = asBoundedString(record.title, 240);
  const category = asBoundedString(record.category, 120);
  const route = asBoundedString(record.route, 240);
  const icon = asBoundedString((record.icon as string) || 'ph-file-text', 64);

  if (!id) return block({ code: 'search.doc.id', message: 'Document id is missing or invalid.' });
  if (!title)
    return block({ code: 'search.doc.title', message: 'Document title is missing or invalid.' });
  if (!category)
    return block({
      code: 'search.doc.category',
      message: 'Document category is missing or invalid.',
    });
  const routeOk =
    route &&
    (SAFE_PATH_ROUTE_RE.test(route) || SAFE_HASH_ROUTE_RE.test(route)) &&
    !/[:?#]|\/\//.test(route) &&
    !route.includes('..');
  if (!routeOk) {
    return block({ code: 'search.doc.route', message: 'Document route is missing or unsafe.' });
  }
  if (!icon || !SAFE_ICON_RE.test(icon)) {
    return block({ code: 'search.doc.icon', message: 'Document icon is invalid.' });
  }
  if (
    !Array.isArray(record.keywords) ||
    !Array.isArray(record.headings) ||
    !Array.isArray(record.classes) ||
    !Array.isArray(record.chunks)
  ) {
    return block({
      code: 'search.doc.arrays',
      message: 'Document keywords/headings/classes/chunks must be arrays.',
    });
  }
  if (typeof record.bodyText !== 'string' || record.bodyText.length > 12000) {
    return block({
      code: 'search.doc.body',
      message: 'Document bodyText is missing or too large.',
    });
  }

  return allow();
}

export function validateSearchIndexPayload(
  payload: unknown,
  options: { maxDocuments?: number } = {},
): GuardrailResult {
  const maxDocuments = options.maxDocuments ?? 5000;
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { documents?: unknown }).documents)
  ) {
    return block({
      code: 'search.index.shape',
      message: 'Index payload must contain a documents array.',
    });
  }

  const docs = (payload as { documents: unknown[] }).documents;
  if (docs.length === 0)
    return block({ code: 'search.index.empty', message: 'Index documents array is empty.' });
  if (docs.length > maxDocuments) {
    return block({
      code: 'search.index.too_many_docs',
      message: `Index has too many documents (max ${maxDocuments}).`,
    });
  }

  const ids = new Set<string>();
  for (const doc of docs) {
    const check = validateSearchIndexDocument(doc);
    if (!check.allowed) return check;
    const id = (doc as { id: string }).id;
    if (ids.has(id)) {
      return block({
        code: 'search.index.duplicate_id',
        message: `Duplicate document id: ${id}`,
      });
    }
    ids.add(id);
  }

  return allow({ documentCount: docs.length, documentIds: ids });
}

export function validateVectorPayload(
  payload: unknown,
  options: { maxDocuments?: number; maxDimensions?: number } = {},
): GuardrailResult {
  const maxDocuments = options.maxDocuments ?? 5000;
  const maxDimensions = options.maxDimensions ?? 4096;

  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { documents?: unknown }).documents)
  ) {
    return block({
      code: 'search.vectors.shape',
      message: 'Vector payload must contain a documents array.',
    });
  }

  const vectors = (payload as { documents: Array<{ id?: unknown; embedding?: unknown }> })
    .documents;
  if (vectors.length === 0)
    return block({ code: 'search.vectors.empty', message: 'Vector documents array is empty.' });
  if (vectors.length > maxDocuments) {
    return block({
      code: 'search.vectors.too_many_docs',
      message: `Vector payload has too many rows (max ${maxDocuments}).`,
    });
  }

  let dimension: number | null = null;
  for (const row of vectors) {
    if (
      !row ||
      typeof row !== 'object' ||
      typeof row.id !== 'string' ||
      !Array.isArray(row.embedding)
    ) {
      return block({
        code: 'search.vectors.row_shape',
        message: 'Vector row must include id and embedding array.',
      });
    }

    if (dimension === null) {
      dimension = row.embedding.length;
      if (dimension < 2 || dimension > maxDimensions) {
        return block({
          code: 'search.vectors.dimension',
          message: 'Vector embedding dimension is invalid.',
        });
      }
    } else if (row.embedding.length !== dimension) {
      return block({
        code: 'search.vectors.dimension_mismatch',
        message: 'Vector embedding dimensions are inconsistent.',
      });
    }

    for (const value of row.embedding) {
      if (!Number.isFinite(value as number)) {
        return block({
          code: 'search.vectors.non_finite',
          message: `Vector for doc ${row.id} contains non-finite values.`,
        });
      }
    }
  }

  return allow({ dimensions: dimension, count: vectors.length });
}

export function safeDocHref(baseUrl: unknown, route: unknown): string {
  let safeBase = String(baseUrl || '').trim() || DEFAULT_DOCS_BASE;
  try {
    const parsed = new URL(safeBase);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      safeBase = DEFAULT_DOCS_BASE;
    } else {
      safeBase = parsed.origin + parsed.pathname.replace(/\/$/, '');
    }
  } catch {
    safeBase = DEFAULT_DOCS_BASE;
  }

  const safeRoute = String(route || '').trim();
  if (!safeRoute) return '#';
  if (/[:?#]|\/\//.test(safeRoute) || safeRoute.includes('..')) return '#';

  if (safeRoute.startsWith('/')) {
    if (!SAFE_PATH_ROUTE_RE.test(safeRoute)) return '#';
    if (safeRoute === '/') return `${safeBase}/`;
    return `${safeBase}${safeRoute}`;
  }

  if (!SAFE_HASH_ROUTE_RE.test(safeRoute)) return '#';
  return `${safeBase}/#${safeRoute}`;
}

export function sanitizeIconClass(icon: unknown): string {
  const value = String(icon || '')
    .trim()
    .replace(/^ph-/, '');
  if (!SAFE_ICON_RE.test(value)) return 'file-text';
  return value;
}

export const searchGuardrails = {
  normalizeSearchQuery,
  validateSearchQuery,
  validateSearchIndexDocument,
  validateSearchIndexPayload,
  validateVectorPayload,
  safeDocHref,
  sanitizeIconClass,
};
