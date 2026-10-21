/** Verify approved UnoOne media sources and materialize local web assets without network access. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'assets-source', 'unoone');
const output = resolve(root, 'public', 'unoone');

// Whitelisted media that may be released on the site. Everything else fails closed.
const WHITELIST = new Set(['power-ui.png', 'mobile-ui.png']);
const MAX_BYTES = 1_500_000;

const manifest = JSON.parse(readFileSync(resolve(source, 'manifest.json'), 'utf8')) as {
  description: string;
  created: string;
  assets: { filename: string; bytes: number; sha256: string }[];
};

mkdirSync(output, { recursive: true });

let written = 0;
for (const asset of manifest.assets) {
  if (!WHITELIST.has(asset.filename)) {
    throw new Error(`Asset ${asset.filename} is not on the release whitelist`);
  }
  if (asset.bytes > MAX_BYTES) {
    throw new Error(`Asset ${asset.filename} exceeds size budget (${asset.bytes} bytes)`);
  }
  const encoded = readFileSync(resolve(source, `${asset.filename}.b64`), 'utf8').replace(/\s+/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== asset.bytes) {
    throw new Error(`Asset ${asset.filename} decoded to ${bytes.length} bytes, manifest says ${asset.bytes}`);
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== asset.sha256) {
    throw new Error(`Asset ${asset.filename} hash mismatch: got ${digest}, expected ${asset.sha256}`);
  }
  writeFileSync(resolve(output, asset.filename), bytes);
  written += bytes.length;
}

process.stdout.write(`unoone media: verified ${manifest.assets.length} assets, wrote ${written} bytes to public/unoone\n`);