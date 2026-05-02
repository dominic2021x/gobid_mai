/**
 * Comprimă imaginile de la slider (hero) pentru încărcare mai rapidă.
 * Folosește sharp: max 1920px lățime, JPG calitate 82.
 * Rulează: node scripts/compress-slider-images.js
 */
const path = require('path');
const fs = require('fs');

const SLIDER_DIR = path.join(__dirname, '..', 'public', 'images', 'slider');
const MAX_WIDTH = 1920;
const JPG_QUALITY = 82;

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Instalează sharp: npm install sharp');
    process.exit(1);
  }

  const files = fs.readdirSync(SLIDER_DIR).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
  if (files.length === 0) {
    console.log('Nicio imagine .jpg/.png în', SLIDER_DIR);
    return;
  }

  for (const file of files) {
    const filePath = path.join(SLIDER_DIR, file);
    const stat = fs.statSync(filePath);
    const ext = path.extname(file).toLowerCase();
    const outPath = path.join(SLIDER_DIR, path.basename(file, ext) + '.jpg');

    const buffer = await sharp(filePath)
      .resize(MAX_WIDTH, null, { withoutEnlargement: true })
      .jpeg({ quality: JPG_QUALITY, mozjpeg: true })
      .toBuffer();

    const newSize = buffer.length;
    const saved = stat.size - newSize;
    const tmpPath = outPath + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, outPath);
    if (outPath !== filePath && ext !== '.jpg') fs.unlinkSync(filePath);

    console.log(
      path.basename(file),
      '→',
      (stat.size / 1024).toFixed(1),
      'KB →',
      (newSize / 1024).toFixed(1),
      'KB',
      saved > 0 ? `(-${(saved / 1024).toFixed(1)} KB)` : ''
    );
  }
  console.log('Gata. Reîncarcă pagina și verifică LCP.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
