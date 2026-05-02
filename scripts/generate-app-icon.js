#!/usr/bin/env node
/**
 * Copiază icon.png din gobid_aplicatii/resources în assets/ pentru @capacitor/assets.
 * Sursa: gobid_aplicatii/resources/icon.png (1024x1024)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE_ICON = path.join(ROOT, 'gobid_aplicatii', 'resources', 'icon.png');
const ASSETS_DIR = path.join(ROOT, 'assets');
const SIZE = 1024;

async function main() {
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error('Icon nu există:', SOURCE_ICON);
    process.exit(1);
  }

  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  const meta = await sharp(SOURCE_ICON).metadata();
  const needsResize = meta.width !== SIZE || meta.height !== SIZE;

  // icon-only.png - icon complet
  if (needsResize) {
    await sharp(SOURCE_ICON).resize(SIZE, SIZE).png()
      .toFile(path.join(ASSETS_DIR, 'icon-only.png'));
  } else {
    fs.copyFileSync(SOURCE_ICON, path.join(ASSETS_DIR, 'icon-only.png'));
  }
  console.log('Icon copiat: icon-only.png');

  // icon-foreground.png - același icon (pentru adaptive)
  const fgPath = path.join(ASSETS_DIR, 'icon-foreground.png');
  if (needsResize) {
    await sharp(SOURCE_ICON).resize(SIZE, SIZE).png().toFile(fgPath);
  } else {
    fs.copyFileSync(SOURCE_ICON, fgPath);
  }
  console.log('Icon copiat: icon-foreground.png');

  // icon-background.png - fundal alb
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: '#FFFFFF' }
  }).png().toFile(path.join(ASSETS_DIR, 'icon-background.png'));
  console.log('Icon generat: icon-background.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
