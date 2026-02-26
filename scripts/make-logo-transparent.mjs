/**
 * One-off script: make TestsPrep logo background transparent.
 * Makes near-white and light grey pixels fully transparent.
 */
import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const inputPath = join(publicDir, "testsprep-logo.png");
const outputPath = join(publicDir, "testsprep-logo-transparent.png");

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const BRIGHTNESS_THRESHOLD = 235;
const GREY_THRESHOLD = 220;

for (let i = 0; i < data.length; i += channels) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const brightness = (r + g + b) / 3;
  const isNearWhite = brightness >= BRIGHTNESS_THRESHOLD;
  const isLightGrey =
    Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && brightness >= GREY_THRESHOLD;
  if (isNearWhite || isLightGrey) {
    data[i + 3] = 0;
  }
}

await sharp(Buffer.from(data), {
  raw: { width, height, channels },
})
  .png()
  .toFile(outputPath);

console.log("Done: testsprep-logo-transparent.png written.");
