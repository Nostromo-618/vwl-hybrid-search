import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateSearchIndexPayload, validateVectorPayload } from '../src/index.js';
const moduleUrl = new URL('../scripts/lib/canonical-index.mjs', import.meta.url).href;
const { enrichDocument, buildCanonicalAssets } = await import(moduleUrl);
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});
const doc = {
  id: 'dock',
  route: '/dock',
  title: 'Dock',
  category: 'Components',
  keywords: ['dock'],
  headings: [],
  bodyText: 'Dock navigation on screen edges.',
};
const html =
  '<main id="main-content"><section id="dock"><h2>Dock</h2><p>Navigation</p><table><tr><th>Prop</th><th>Type</th></tr><tr><td>placement</td><td>bottom | top | left | right</td></tr></table><pre>&lt;VdDock :placement="edge" /&gt;</pre><script>throw new Error("must not execute")</script></section></main>';
describe('canonical atomic indexer', () => {
  it('enriches code, API tables and verified anchors without executing source', () => {
    const enriched = enrichDocument(doc, html);
    expect(enriched.anchors).toEqual(['dock']);
    expect(enriched.classes).toContain('VdDock');
    expect(
      enriched.chunks.some((c: { text: string }) => c.text.includes('placement | bottom')),
    ).toBe(true);
    expect(enriched.bodyText).not.toContain('must not execute');
    expect(() => enrichDocument({ ...doc, route: '/../../secret' }, html)).toThrow(/Unsafe/);
    expect(() => enrichDocument(doc, '<div>missing</div>')).toThrow(/Missing/);
  });
  it('publishes only a complete matching set and preserves its manifest after failure', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vwl-index-test-'));
    dirs.push(dir);
    const input = path.join(dir, 'source.json');
    await fs.writeFile(input, JSON.stringify({ documents: [doc] }));
    await fs.writeFile(path.join(dir, 'dock.html'), html);
    const config = {
      input,
      htmlDir: dir,
      outDir: path.join(dir, 'output'),
      presets: ['minilm', 'embeddinggemma'],
    };
    const dispose = vi.fn();
    const pipeline = async (_task: string, model: string) =>
      Object.assign(
        async () => ({ data: new Float32Array(model.includes('MiniLM') ? 384 : 768).fill(0.1) }),
        { dispose },
      );
    const helpers = {
      pipeline,
      validateIndex: validateSearchIndexPayload,
      validateVectors: validateVectorPayload,
      log: () => {},
    };
    const manifest = await buildCanonicalAssets(config, helpers);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(manifest.documentCount).toBe(1);
    expect(manifest.presets.minilm.dimensions).toBe(384);
    const before = await fs.readFile(path.join(config.outDir, 'search-manifest.json'), 'utf8');
    await expect(
      buildCanonicalAssets(config, {
        ...helpers,
        pipeline: async () => async () => ({ data: [NaN] }),
      }),
    ).rejects.toThrow(/Invalid embedding/);
    expect(await fs.readFile(path.join(config.outDir, 'search-manifest.json'), 'utf8')).toBe(
      before,
    );
    await fs.rm(path.join(dir, 'dock.html'));
    await expect(buildCanonicalAssets(config, helpers)).rejects.toThrow();
    expect(await fs.readFile(path.join(config.outDir, 'search-manifest.json'), 'utf8')).toBe(
      before,
    );
  });
});
