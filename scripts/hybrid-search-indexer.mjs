#!/usr/bin/env node
/**
 * Legacy alias — delegates to vwl-hybrid-index with default ./data output.
 *
 * Usage:
 *   pnpm index
 *   VD3_DOCS_PATH=../vd3-docs pnpm index
 *   VWL_PRESET=embeddinggemma pnpm index
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(__dirname, 'vwl-hybrid-index.mjs');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 1));
