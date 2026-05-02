/**
 * Generator de imagini ANAF
 * Creează automat o imagine pentru produsele importate de la ANAF
 */

import { createCanvas, loadImage } from 'canvas';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface GenerateANAFImageOptions {
  localitate: string;
  subcategory: string;
  outputPath?: string;
  imageText?: string; // Text personalizat pentru imagine (default: "ANAF")
}

/**
 * Generează o imagine ANAF cu logo, localitate și subcategorie
 */
export async function generateANAFImage(
  options: GenerateANAFImageOptions
): Promise<{ url: string; path: string }> {
  const { localitate, subcategory, outputPath, imageText = 'ANAF' } = options;

  // Dimensiuni imagine
  const width = 1200;
  const height = 630; // Format standard pentru social media

  // Creează canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fundal gradient (culori ANAF: albastru și alb) - mai închis
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(30, 58, 138, 0.55)'); // Albastru închis - mai închis
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.55)'); // Albastru deschis - mai închis
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Adaugă un overlay pentru efect blurat - mai închis
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fillRect(0, 0, width, height);
  
  // Adaugă un layer blurat subtil pentru a face textul mai vizibil
  // Desenăm un pattern blurat prin desenarea unor forme semi-transparente
  ctx.save();
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + Math.random() * 0.2})`;
    ctx.fillRect(
      Math.random() * width,
      Math.random() * height,
      Math.random() * 100 + 50,
      Math.random() * 100 + 50
    );
  }
  ctx.restore();

  // Încarcă și adaugă logo-ul (centrat sus)
  try {
    const logoPath = join(process.cwd(), 'public', 'logo-light.svg');
    if (existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      // Dimensiuni logo (ajustate pentru imagine)
      const logoWidth = 300;
      const logoHeight = (logo.height / logo.width) * logoWidth;
      // Poziționează logo-ul centrat sus
      const logoX = (width - logoWidth) / 2;
      const logoY = 50;
      ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
      console.log('[Image Generator] Logo loaded and added to image');
    } else {
      console.warn('[Image Generator] Logo file not found at:', logoPath);
    }
  } catch (logoError: any) {
    console.warn('[Image Generator] Failed to load logo:', logoError.message);
    // Continuă fără logo dacă eșuează
  }

  // Localitate - centrat corect cu aliniere perfectă
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px Arial';
  ctx.textAlign = 'center'; // Aliniere centrată
  ctx.textBaseline = 'middle'; // Aliniere verticală centrată
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillText(localitate || 'Necunoscut', width / 2, 350);
  
  // Resetează umbra
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Subcategorie - galben pentru contrast, centrat corect
  ctx.fillStyle = '#fbbf24'; // Galben pentru contrast
  ctx.font = 'bold 40px Arial';
  ctx.textAlign = 'center'; // Aliniere centrată
  ctx.textBaseline = 'middle'; // Aliniere verticală centrată
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillText(subcategory || 'Licitație Publică', width / 2, 430);
  
  // Resetează umbra
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Text mic în jos - centrat corect
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '24px Arial';
  ctx.textAlign = 'center'; // Aliniere centrată
  ctx.textBaseline = 'middle'; // Aliniere verticală centrată
  ctx.fillText('Licitație Publică', width / 2, 520);

  // Salvează imaginea
  const uploadsDir = join(process.cwd(), 'public', 'uploads', 'anaf');
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }

  const timestamp = Date.now();
  const fileName = `anaf_${timestamp}_${localitate?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown'}.png`;
  const filePath = outputPath || join(uploadsDir, fileName);

  const buffer = canvas.toBuffer('image/png');
  await writeFile(filePath, buffer);

  // Returnează URL-ul relativ
  const url = `/uploads/anaf/${fileName}`;

  return { url, path: filePath };
}

/**
 * Generează o imagine ANAF simplificată (fără canvas, folosind SVG)
 * Alternativă mai ușoară dacă canvas nu este disponibil
 */
export async function generateANAFImageSVG(
  options: GenerateANAFImageOptions
): Promise<{ url: string; path: string }> {
  const { localitate, subcategory } = options;

  const width = 1200;
  const height = 630;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad)"/>
      <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.3)"/>
      
      <!-- Text ANAF -->
      <text x="${width/2}" y="150" font-family="Arial, sans-serif" font-size="120" font-weight="bold" 
            fill="#ffffff" text-anchor="middle" dominant-baseline="middle">ANAF</text>
      
      <!-- Linie sub ANAF -->
      <line x1="${width/2 - 150}" y1="200" x2="${width/2 + 150}" y2="200" 
            stroke="#ffffff" stroke-width="4"/>
      
      <!-- Localitate -->
      <text x="${width/2}" y="300" font-family="Arial, sans-serif" font-size="48" font-weight="bold" 
            fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${localitate || 'Necunoscut'}</text>
      
      <!-- Subcategorie -->
      <text x="${width/2}" y="380" font-family="Arial, sans-serif" font-size="36" 
            fill="#fbbf24" text-anchor="middle" dominant-baseline="middle">${subcategory || 'Licitație Publică'}</text>
      
      <!-- Text mic -->
      <text x="${width/2}" y="520" font-family="Arial, sans-serif" font-size="24" 
            fill="rgba(255,255,255,0.8)" text-anchor="middle" dominant-baseline="middle">Licitație Publică ANAF</text>
    </svg>
  `.trim();

  const uploadsDir = join(process.cwd(), 'public', 'uploads', 'anaf');
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }

  const timestamp = Date.now();
  const fileName = `anaf_${timestamp}_${localitate?.replace(/[^a-zA-Z0-9]/g, '_') || 'unknown'}.svg`;
  const filePath = join(uploadsDir, fileName);

  await writeFile(filePath, svg);

  const url = `/uploads/anaf/${fileName}`;

  return { url, path: filePath };
}

