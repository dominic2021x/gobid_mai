const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const iconsDir = path.join(__dirname, "..", "public", "icons");
const files = ["tap-hand.png", "swipe-tutorial-hands.png"];
const WHITE_THRESHOLD = 248;

async function whiteToTransparent(inputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(inputPath);
  console.log("Done:", inputPath);
}

async function main() {
  for (const file of files) {
    const p = path.join(iconsDir, file);
    if (fs.existsSync(p)) await whiteToTransparent(p);
    else console.warn("Skip (not found):", p);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
