#!/usr/bin/env node
/** Canonical local docs exporter. Navigation JavaScript is never downloaded or executed. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCanonicalAssets } from './lib/canonical-index.mjs';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help') {
    console.log(
      'vwl-hybrid-index --input <search-index.json> --html-dir <dist> --source-root <docs-repo> --out <data-dir> [--presets minilm,embeddinggemma] [--config config.json]',
    );
    process.exit(0);
  }
  if (
    !['--config', '--input', '--html-dir', '--source-root', '--out', '--presets'].includes(
      args[i],
    ) ||
    !args[i + 1]
  )
    throw new Error(
      `Unknown or incomplete option: ${args[i]}. Use --help. Legacy nav.ts execution has been removed.`,
    );
  options[args[i].slice(2)] = args[++i];
}
const config = options.config
  ? JSON.parse(await fs.readFile(path.resolve(options.config), 'utf8'))
  : {};
const sourceRoot = path.resolve(
  options['source-root'] || config.sourceRoot || process.env.VD3_DOCS_PATH || '../../vd3/vd3-docs',
);
const htmlDir = path.resolve(
  options['html-dir'] || config.htmlDir || path.join(sourceRoot, 'dist'),
);
const input = path.resolve(
  options.input || config.input || path.join(htmlDir, 'search/search-index.json'),
);
const outDir = path.resolve(options.out || config.outDir || 'data');
const presets = options.presets
  ? options.presets.split(',')
  : config.presets || ['minilm', 'embeddinggemma'];
const { pipeline } = await import('@huggingface/transformers');
const { validateSearchIndexPayload: validateIndex, validateVectorPayload: validateVectors } =
  await import('../dist/index.js');
await buildCanonicalAssets(
  { input, htmlDir, sourceRoot, outDir, presets },
  { pipeline, validateIndex, validateVectors },
);
