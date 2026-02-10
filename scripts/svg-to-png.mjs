import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'inbharat-logo.svg');
const outPath = join(root, 'public', 'inbharat-logo.png');

const svg = readFileSync(svgPath);
const sizes = [512, 1024];

for (const size of sizes) {
  const path = join(root, 'public', `inbharat-logo${size === 512 ? '' : `-${size}`}.png`);
  await sharp(svg).resize(size, size).png().toFile(path);
  console.log(`Created ${path} (${size}x${size})`);
}
