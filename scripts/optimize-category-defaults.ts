/**
 * Copiază și optimizează imaginile de categorie în public/images/category-defaults/.
 * Caută surse în ASSETS_DIR (sau ./assets) după prefix; salvează WebP redimensionat (max 800px lățime, calitate 80).
 *
 * Utilizare:
 *   ASSETS_DIR=/path/la/assets npx tsx scripts/optimize-category-defaults.ts
 * Sau pune PNG-urile în ./assets și rulează fără ASSETS_DIR.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = path.resolve(process.cwd());
const ASSETS_DIR = process.env.ASSETS_DIR || path.join(ROOT, "assets");
const OUT_DIR = path.join(ROOT, "public", "images", "category-defaults");

/** output filename (fără extensie) -> prefixuri pentru căutare (primul match contează) */
const MAP: Record<string, string[]> = {
  automobile: ["automobile-"],
  imobiliare: ["case_apartamente-"],
  moda: ["moda_lifestyle-"],
  teren: ["teren-"],
  agricultura: ["agricultura_zootehnie-"],
  "piese-auto": ["piese_auto-"],
  maritime: ["maritine_aeronautica-"],
  electronice: ["electronice_tehnologie-"],
  mobilier: ["mobilier-"],
  arta: ["arta_echipamente-"],
  "mama-copil": ["mama_copilul-"],
  utilaje: ["utilaje_echipamente-"],
  materiale: ["materialedeconstructii-"],
  diverse: ["diverse_speciale-"],
};

const MAX_WIDTH = 800;
const WEBP_QUALITY = 80;

function findSourceFile(outKey: string): string | null {
  const prefixes = MAP[outKey];
  if (!prefixes) return null;
  const files = fs.readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".png"));
  for (const p of prefixes) {
    const found = files.find((f) => f.startsWith(p));
    if (found) return path.join(ASSETS_DIR, found);
  }
  return null;
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error("Director sursă lipsă:", ASSETS_DIR);
    console.error("Set ASSETS_DIR sau creează ./assets și pune acolo PNG-urile de categorie.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const outKey of Object.keys(MAP)) {
    const srcPath = findSourceFile(outKey);
    if (!srcPath) {
      console.warn("Skip", outKey, "- nu s-a găsit niciun PNG cu prefixul definit.");
      continue;
    }
    const outPath = path.join(OUT_DIR, `${outKey}.webp`);
    try {
      const buf = fs.readFileSync(srcPath);
      await sharp(buf)
        .resize(MAX_WIDTH, null, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 6 })
        .toFile(outPath);
      console.log("OK", outKey, "->", outPath);
    } catch (e) {
      console.error("Eroare la", outKey, e);
    }
  }
  console.log("Gata. Imaginile sunt în", OUT_DIR);
}

main();
