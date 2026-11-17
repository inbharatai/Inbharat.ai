/** Local API compatibility probes for patched development dependencies.
 * Not a hosted Vercel build or a claim that upstream advisories are eliminated.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getConfig } = require('@vercel/static-config');
const { nodeFileTrace } = require('@vercel/nft');
const { glob } = require('glob');
const { minimatch } = require('minimatch');
const yaml = require('js-yaml');
const toml = require('smol-toml');
const dir = mkdtempSync(join(tmpdir(), 'unoone-toolchain-'));
try {
  writeFileSync(join(dir,'entry.cjs'), "const fs=require('node:fs');require('./leaf.js');fs.readFileSync(__dirname+'/data.json');");
  writeFileSync(join(dir,'leaf.js'), 'module.exports = 7;');
  writeFileSync(join(dir,'data.json'), '{"ok":true}');
  writeFileSync(join(dir,'function.ts'), 'export const config = { memory: 1024, maxDuration: 60 }; export default function handler() {}');
  const config = getConfig(null, join(dir,'function.ts'));
  assert.equal(config.memory,1024); assert.equal(config.maxDuration,60);
  writeFileSync(join(dir,'invalid.ts'), 'export const config = { memory: "invalid" };');
  assert.throws(()=>getConfig(null,join(dir,'invalid.ts')));
  const trace=await nodeFileTrace([join(dir,'entry.cjs')],{base:dir,processCwd:dir});
  for(const name of ['entry.cjs','leaf.js','data.json']) assert.ok(trace.fileList.has(name), `missing traced ${name}`);
  assert.deepEqual((await glob('**/*.{js,json}',{cwd:dir,nodir:true})).sort(),['data.json','leaf.js']);
  assert.equal(minimatch('src/a.ts','src/**/*.ts'),true);
  assert.equal(minimatch('src/a.js','src/**/*.ts'),false);
  assert.deepEqual(yaml.load('name: UnoOne\nlist: [1, 2]'),{name:'UnoOne',list:[1,2]});
  assert.equal(toml.parse('name = "UnoOne"').name,'UnoOne');
  const legacy=require('path-to-regexp');
  assert.ok(legacy.pathToRegexp('/api/:slug').test('/api/example'));
  const modern=createRequire(require.resolve('router'))('path-to-regexp');
  assert.equal(modern.match('/api/:slug')('/api/example').params.slug,'example');
  console.log('toolchain-compat: static config validation, file tracing, glob/minimatch, YAML/TOML and both router APIs passed; no network/deployment performed');
} finally { rmSync(dir,{recursive:true,force:true}); }
