import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { EMBEDDING_PRESETS, buildEmbedInput } from './embedding-presets.mjs';

const clean = (s) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
export const hash = (s) => createHash('sha256').update(s).digest('hex');
const unique = (xs) => [...new Set(xs.filter(Boolean))];
const safeAnchor = (id) => (/^[a-z0-9][a-z0-9_-]*$/i.test(id || '') ? id : '');

/** Parse inert rendered HTML; no downloaded JavaScript is ever evaluated. */
export function enrichDocument(doc, html) {
  if (!/^\/(?:[a-z0-9/_-]*)$/i.test(doc.route) || doc.route.includes('..'))
    throw new Error(`Unsafe route: ${doc.route}`);
  const { document } = parseHTML(html);
  const content =
    document.querySelector('.doc-content') || document.querySelector('main#main-content');
  if (!content) throw new Error(`Missing rendered documentation content for ${doc.route}`);
  for (const node of content.querySelectorAll('script,style,nav,canvas')) node.remove();
  const anchors = unique(
    [...content.querySelectorAll('section[id],h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')].map(
      (n) => safeAnchor(n.id),
    ),
  );
  const headings = unique([
    ...(doc.headings || []),
    ...[...content.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((n) => clean(n.textContent)),
  ]);
  const api = [...content.querySelectorAll('table')].map((t) =>
    [...t.querySelectorAll('tr')]
      .map((r) => [...r.querySelectorAll('th,td')].map((c) => clean(c.textContent)).join(' | '))
      .join('\n'),
  );
  const code = [...content.querySelectorAll('pre')]
    .map((n) => n.textContent.trim().slice(0, 1200))
    .filter(Boolean)
    .slice(0, 6);
  const identifiers = unique(
    [...content.querySelectorAll('code,pre,table td:first-child')].flatMap(
      (n) =>
        clean(n.textContent).match(
          /\b(?:Vd[A-Z]\w*|use[A-Z]\w*|vd-[a-z0-9-]+|[a-z]+(?:-[a-z]+)+)\b/g,
        ) || [],
    ),
  );
  const rootAnchor = anchors[0] || '';
  const chunks = [
    { heading: doc.title, anchor: rootAnchor, text: clean(doc.bodyText).slice(0, 1600) },
  ];
  for (const text of api) {
    // Keep table rows together where possible, splitting large API tables into bounded excerpts.
    let part = '';
    for (const row of text.split('\n')) {
      if (part.length + row.length > 1400 && part) {
        chunks.push({ heading: 'API', anchor: rootAnchor, text: part });
        part = '';
      }
      part += `${row.slice(0, 1400)}\n`;
    }
    if (part) chunks.push({ heading: 'API', anchor: rootAnchor, text: part });
  }
  for (const example of code)
    chunks.push({ heading: 'Example', anchor: rootAnchor, text: example });
  for (const section of content.querySelectorAll('section[id]')) {
    if (section.id === rootAnchor || !safeAnchor(section.id)) continue;
    chunks.push({
      heading: clean(section.querySelector('h1,h2,h3,h4,h5,h6')?.textContent) || doc.title,
      anchor: section.id,
      text: clean(section.textContent).slice(0, 1600),
    });
  }
  return {
    ...doc,
    icon: doc.icon || 'file-text',
    headings,
    anchors,
    classes: identifiers,
    keywords: unique([...(doc.keywords || []), ...identifiers]),
    chunks: chunks.filter((c) => c.text),
    bodyText: [doc.bodyText, ...api, ...code].join('\n').slice(0, 12000),
  };
}

export async function buildCanonicalCorpus({ input, htmlDir, sourceRoot }) {
  const raw = await fs.readFile(input, 'utf8');
  const exported = JSON.parse(raw);
  if (!Array.isArray(exported.documents) || !exported.documents.length)
    throw new Error('Empty canonical search export.');
  const ids = new Set();
  const routes = new Set();
  const documents = [];
  const fingerprints = [hash(raw)];
  for (const doc of exported.documents) {
    if (!doc.id || ids.has(doc.id) || routes.has(doc.route))
      throw new Error(`Duplicate or missing identity: ${doc.id}`);
    ids.add(doc.id);
    routes.add(doc.route);
    if (!/^\/[a-z0-9/_-]*$/i.test(doc.route) || doc.route.includes('..'))
      throw new Error(`Unsafe route: ${doc.route}`);
    const filename = doc.route === '/' ? 'index.html' : `${doc.route.slice(1)}.html`;
    const html = await fs.readFile(path.join(htmlDir, filename), 'utf8');
    fingerprints.push(`${doc.route}:${hash(html)}`);
    documents.push(enrichDocument(doc, html));
  }
  let revision = 'unknown';
  let dirty = false;
  if (sourceRoot) {
    revision = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    dirty = !!execFileSync('git', ['-C', sourceRoot, 'status', '--porcelain'], {
      encoding: 'utf8',
    }).trim();
  }
  const sourceContentHash = hash(fingerprints.join('\n'));
  const corpusHash = hash(JSON.stringify(documents));
  return {
    schemaVersion: 1,
    source: 'https://vd3.vanduo.dev',
    sourceRevision: revision,
    sourceDirty: dirty,
    sourceContentHash,
    corpusHash,
    documents,
  };
}

export async function buildCanonicalAssets(
  config,
  { pipeline, validateIndex, validateVectors, log = console.log },
) {
  const corpus = await buildCanonicalCorpus(config);
  const valid = validateIndex(corpus);
  if (!valid.allowed) throw new Error(valid.message);
  const presets = config.presets || ['minilm', 'embeddinggemma'];
  if (!presets.length || presets.some((id) => !EMBEDDING_PRESETS[id]))
    throw new Error('Unknown embedding preset.');
  const payloads = {};
  for (const id of presets) {
    const preset = EMBEDDING_PRESETS[id];
    log(`Embedding ${corpus.documents.length} routes with ${id} (${preset.dimensions} dimensions)`);
    const extractor = await pipeline('feature-extraction', preset.modelName, {
      dtype: preset.dtype,
    });
    const documents = [];
    try {
      for (const doc of corpus.documents) {
        const output = await extractor(buildEmbedInput(doc, id), {
          pooling: 'mean',
          normalize: true,
        });
        const embedding = Array.from(output.data);
        if (embedding.length !== preset.dimensions || embedding.some((v) => !Number.isFinite(v)))
          throw new Error(`Invalid embedding for ${doc.id}`);
        documents.push({ id: doc.id, embedding });
        if (documents.length % 20 === 0)
          log(`${id}: ${documents.length}/${corpus.documents.length}`);
      }
    } finally {
      await extractor.dispose?.();
    }
    const payload = {
      schemaVersion: 1,
      corpusHash: corpus.corpusHash,
      sourceRevision: corpus.sourceRevision,
      sourceContentHash: corpus.sourceContentHash,
      model: preset.modelName,
      dimensions: preset.dimensions,
      dtype: preset.dtype,
      pooling: 'mean',
      normalize: true,
      queryPrefix: preset.queryPrefix,
      documentPrefix:
        id === 'embeddinggemma' ? 'title: {title} | text: ' : id === 'e5' ? 'passage: ' : '',
      documents,
    };
    const check = validateVectors(payload);
    if (!check.allowed) throw new Error(check.message);
    payloads[id] = payload;
  }
  // Publish only after every route, parser, model and validation succeeded. Immutable
  // generations plus one atomic manifest prevent clients from mixing asset versions.
  const generation = hash(JSON.stringify({ corpus, payloads })).slice(0, 24);
  const dir = path.join(config.outDir, 'search', generation);
  await fs.mkdir(dir, { recursive: true });
  const indexText = JSON.stringify(corpus);
  await fs.writeFile(path.join(dir, 'search-index.json'), indexText);
  const manifest = {
    schemaVersion: 1,
    generation,
    corpusHash: corpus.corpusHash,
    sourceRevision: corpus.sourceRevision,
    sourceContentHash: corpus.sourceContentHash,
    documentCount: corpus.documents.length,
    index: `search/${generation}/search-index.json`,
    indexHash: hash(indexText),
    presets: {},
  };
  for (const [id, payload] of Object.entries(payloads)) {
    const text = JSON.stringify(payload);
    const file = `vectors-${id}.json`;
    await fs.writeFile(path.join(dir, file), text);
    manifest.presets[id] = {
      path: `search/${generation}/${file}`,
      hash: hash(text),
      model: payload.model,
      dimensions: payload.dimensions,
      dtype: payload.dtype,
      pooling: payload.pooling,
      queryPrefix: payload.queryPrefix,
      documentPrefix: payload.documentPrefix,
    };
  }
  const staging = path.join(config.outDir, `search-manifest.${process.pid}.tmp`);
  await fs.writeFile(staging, JSON.stringify(manifest, null, 2) + '\n');
  await fs.rename(staging, path.join(config.outDir, 'search-manifest.json'));
  log(
    `Validated generation ${generation}: ${corpus.documents.length} routes, ${presets.join(', ')}`,
  );
  return manifest;
}
