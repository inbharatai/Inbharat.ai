/** Verify approved media sources and materialize local web assets without network access. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'assets-source/product-concepts');
const target = resolve(root, 'public/product-concepts');
const manifest = JSON.parse(readFileSync(resolve(source, 'manifest.json'), 'utf8')) as {
  assets: { filename: string; bytes: number; sha256: string }[];
};
const expected = new Set(['silt.mp4', 'pai.mp4', 'silt.webp', 'pai.webp']);
if (!Array.isArray(manifest.assets) || manifest.assets.length !== expected.size) throw new Error('Invalid product media manifest');
const verified = manifest.assets.map(entry => {
  if (!expected.delete(entry.filename)) throw new Error('Unexpected or duplicate media filename');
  const encoded = readFileSync(resolve(source, `${entry.filename}.b64`), 'utf8').replace(/\s/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || bytes.length !== entry.bytes || bytes.length > 1500000 ||
      createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Invalid media integrity: ${entry.filename}`);
  return { filename: entry.filename, bytes };
});
mkdirSync(target, { recursive: true });
for (const asset of verified) writeFileSync(resolve(target, asset.filename), asset.bytes);
console.log(`[product-concepts] verified ${verified.length} media files (${verified.reduce((n, a) => n + a.bytes.length, 0)} bytes)`);
