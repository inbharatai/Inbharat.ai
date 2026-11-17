import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const original=Buffer.from(readFileSync('assets-source/unoone/unoone-logo.png.b64','utf8').trim(),'base64');
const dark=Buffer.from(readFileSync('assets-source/unoone/unoone-logo-dark.png.b64','utf8').trim(),'base64');
assert.equal(createHash('sha256').update(original).digest('hex'),'8b800572d78ee689238196c5f9372d83d607dafbd728efd4e613dbaa564fbdfc');
assert.equal(createHash('sha256').update(dark).digest('hex'),'191b20660f82bcbfdb24430383ca589a56675ab0b8a14e025fe502f28e85bb22');
const source=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const variant=await sharp(dark).ensureAlpha().raw().toBuffer({resolveWithObject:true});
assert.deepEqual([source.info.width,source.info.height],[288,160]);assert.deepEqual([variant.info.width,variant.info.height],[227,82]);
const pixel=(data:Buffer,width:number,x:number,y:number)=>[...data.subarray((y*width+x)*4,(y*width+x)*4+4)];
for(let y=0;y<82;y++)for(let x=0;x<227;x++)if(x<2||x>=225||y<2||y>=80)assert.equal(pixel(variant.data,227,x,y)[3],0,'transparent safety margin');
let violet=0,ink=0;
for(let y=0;y<160;y++)for(let x=0;x<288;x++){
 const p=pixel(source.data,288,x,y);
 if(p[0]===140&&p[1]===93&&p[2]===247){assert.deepEqual(pixel(variant.data,227,x-46,y-51),p);violet++;}
 if(p[0]===17&&p[1]===18&&p[2]===38){assert.deepEqual(pixel(variant.data,227,x-46,y-51),[237,240,250,255]);ink++;}
}
assert.equal(violet,172);assert.equal(ink,1840);
const manifest=JSON.parse(readFileSync('assets-source/unoone/manifest.json','utf8'));
for(const [name,bytes] of [['unoone-logo.png',original],['unoone-logo-dark.png',dark]] as const){const record=manifest.assets.find((a:{filename:string})=>a.filename===name);assert.equal(record.bytes,bytes.length);assert.equal(record.sha256,createHash('sha256').update(bytes).digest('hex'));}
assert.match(readFileSync('components/UnoOneLogo.tsx','utf8'),/src="\/unoone\/unoone-logo-dark\.png"/);
console.log(`PASS dark logo: original bytes retained; transparent 227×82 variant; ${ink} source neutral-core pixels retain positions and ${violet} violet pixels remain exact. No font substitution or whole-image inversion.`);
