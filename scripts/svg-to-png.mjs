import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const svgPath = join(publicDir, 'inbharat-logo.svg');
const svg = readFileSync(svgPath);

// Logo PNGs (existing)
const sizes = [512, 1024];
for (const size of sizes) {
  const path = join(publicDir, `inbharat-logo${size === 512 ? '' : `-${size}`}.png`);
  await sharp(svg).resize(size, size).png().toFile(path);
  console.log(`Created ${path} (${size}x${size})`);
}

// Favicon: 32x32 for .ico, 512 for favicon.png, 180 for apple-touch-icon
await sharp(svg).resize(32, 32).png().toFile(join(publicDir, 'favicon-32x32.png'));
await sharp(svg).resize(512, 512).png().toFile(join(publicDir, 'favicon.png'));
await sharp(svg).resize(180, 180).png().toFile(join(publicDir, 'apple-touch-icon.png'));
const icoBuf = await pngToIco(join(publicDir, 'favicon-32x32.png'));
writeFileSync(join(publicDir, 'favicon.ico'), icoBuf);
console.log('Created public/favicon.ico, favicon.png, apple-touch-icon.png, favicon-32x32.png');
