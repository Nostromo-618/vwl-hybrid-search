/**
 * Preset constants for Node indexer scripts (mirrors src/embedding-presets.ts).
 */

export const EMBEDDING_PRESETS = {
  embeddinggemma: {
    modelName: 'onnx-community/embeddinggemma-300m-ONNX',
    dtype: 'q8',
    dimensions: 768,
    queryPrefix: 'task: search result | query: ',
    usesDocumentPrefix: true,
  },
  minilm: {
    modelName: 'Xenova/all-MiniLM-L6-v2',
    dtype: 'q8',
    dimensions: 384,
    queryPrefix: '',
    usesDocumentPrefix: false,
  },
  e5: {
    modelName: 'Xenova/multilingual-e5-small',
    dtype: 'q8',
    dimensions: 384,
    queryPrefix: 'query: ',
    usesDocumentPrefix: true,
  },
};

export function prefixDocument(title, text, presetId = 'embeddinggemma') {
  const t =
    String(title || 'none')
      .replace(/\s+/g, ' ')
      .trim() || 'none';
  const body = String(text || '').trim();
  if (presetId === 'e5') return `passage: ${t}. ${body}`.trim();
  if (presetId === 'embeddinggemma') return `title: ${t} | text: ${body}`;
  return body || t;
}

export function documentEmbedText(doc) {
  const parts = [
    Array.isArray(doc.keywords) ? doc.keywords.join('. ') : '',
    Array.isArray(doc.headings) ? doc.headings.join('. ') : '',
    doc.category || '',
    doc.bodyText || '',
  ].filter(Boolean);
  return parts.join('. ');
}

export function buildEmbedInput(doc, presetId) {
  const preset = EMBEDDING_PRESETS[presetId] || EMBEDDING_PRESETS.embeddinggemma;
  const raw = documentEmbedText(doc);
  if (preset.usesDocumentPrefix) {
    return prefixDocument(doc.title, raw, presetId).slice(0, 1600);
  }
  return `${doc.title}. ${doc.category}. ${(doc.bodyText || '').slice(0, 520)}. ${(doc.keywords || []).slice(0, 16).join('. ')}. ${(doc.headings || []).slice(0, 8).join('. ')}`.slice(
    0,
    1000,
  );
}
