/**
 * Download or resize category images to 96x96 and save in public/images/categories/
 * Run: node scripts/download-category-images.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const SIZE = 96;
const OUT_DIR = path.join(__dirname, '..', 'public', 'images', 'categories');
const CATEGORIES = [
  { slug: 'premium', url: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=400&q=80' },
  { slug: 'imobiliare', local: 'category-imobiliare.jpg' },
  { slug: 'executari-silite', url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=400&q=80' },
  { slug: 'autovehicule', local: 'category-auto.jpg' },
  { slug: 'piese-auto', url: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=400&q=80' },
  { slug: 'utilaje', url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=400&q=80' },
  { slug: 'utilaje-agricole', url: 'https://images.unsplash.com/photo-1635168708643-aa398019ca5b?auto=format&fit=crop&w=400&q=80' },
  { slug: 'arta', local: 'category-arta.jpg' },
  { slug: 'electronice', local: 'category-electronice.jpg' },
  { slug: 'casa', url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=400&q=80' },
  { slug: 'mobilier', url: 'https://images.unsplash.com/photo-1581539250439-c96689b516dd?auto=format&fit=crop&w=400&q=80' },
  { slug: 'moda', local: 'category-moda.jpg' },
  { slug: 'mama-copil', local: 'category-mama-copil.jpg' },
  { slug: 'agricultura', url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80' },
  { slug: 'maritime', url: 'https://picsum.photos/seed/maritime-boat/400/400' },
  { slug: 'business', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=400&q=80' },
  { slug: 'materiale', url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80' },
  { slug: 'diverse', url: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=400&q=80' },
  { slug: 'toate', url: 'https://picsum.photos/seed/categories-all/400/400' },
];

function download(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      const redirect = res.statusCode >= 300 && res.statusCode < 400 && res.headers.location;
      if (redirect) return download(redirect).then(resolve).catch(reject);
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function run() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('Install sharp: npm install sharp');
    process.exit(1);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const cat of CATEGORIES) {
    const outPath = path.join(OUT_DIR, cat.slug === 'autovehicule' ? 'category-auto.jpg' : `category-${cat.slug}.jpg`);
    let buffer;
    if (cat.local) {
      const localPath = path.join(OUT_DIR, cat.local);
      if (!fs.existsSync(localPath)) {
        console.warn('Skip (missing):', cat.local);
        continue;
      }
      buffer = fs.readFileSync(localPath);
    } else {
      try {
        buffer = await download(cat.url);
      } catch (err) {
        console.warn('Download failed', cat.slug, err.message);
        continue;
      }
    }
    try {
      await sharp(buffer)
        .resize(SIZE, SIZE, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 82 })
        .toFile(outPath);
      const stat = fs.statSync(outPath);
      console.log('OK', path.basename(outPath), `${(stat.size / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.warn('Resize failed', cat.slug, err.message);
    }
  }
  console.log('Done. Images are', SIZE + 'x' + SIZE, 'in', OUT_DIR);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
