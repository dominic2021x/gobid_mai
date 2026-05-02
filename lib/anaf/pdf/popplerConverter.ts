/**
 * Poppler-based converter (pdftoppm) - PDF -> PNG buffers
 *
 * Folosește utilitarul `pdftoppm` din Poppler pentru a converti un PDF ANAF
 * în imagini PNG la 300 DPI. Este mult mai robust decât pdf2pic și funcționează
 * bine cu PDF-uri scanate.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export interface PopplerPageImage {
  pageNumber: number;
  buffer: Buffer;
}

/**
 * Găsește calea către pdftoppm, căutând în PATH și locații comune
 */
async function findPdfToPpmPath(): Promise<string> {
  const possiblePaths = [
    'pdftoppm', // În PATH
    '/opt/homebrew/bin/pdftoppm', // Apple Silicon Macs
    '/usr/local/bin/pdftoppm', // Intel Macs / Linux
    '/usr/bin/pdftoppm', // Linux system-wide
  ];

  for (const pdftoppmPath of possiblePaths) {
    try {
      // Verifică dacă fișierul există și este executabil
      if (pdftoppmPath === 'pdftoppm') {
        // Pentru 'pdftoppm', verificăm dacă este în PATH folosind execFile
        try {
          await execFileAsync('pdftoppm', ['-v']);
          return 'pdftoppm';
        } catch {
          continue;
        }
      } else {
        // Pentru căi absolute, verificăm dacă fișierul există
        try {
          await fs.access(pdftoppmPath);
          // Verifică dacă este executabil
          const stats = await fs.stat(pdftoppmPath);
          if (stats.isFile()) {
            return pdftoppmPath;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Continuă căutarea
      continue;
    }
  }

  throw new Error(
    'Poppler nu este instalat sau nu este disponibil. ' +
    'Instalează Poppler: macOS: `brew install poppler`, Linux: `sudo apt-get install poppler-utils`. ' +
    'După instalare, repornește serverul Next.js.'
  );
}

/**
 * Convertește un buffer PDF în imagini PNG folosind `pdftoppm`.
 * @param pdfBuffer Buffer-ul PDF-ului
 */
export async function convertPdfToPngWithPoppler(pdfBuffer: Buffer): Promise<PopplerPageImage[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anaf-pdf-'));
  const inputPdfPath = path.join(tmpDir, 'input.pdf');
  const outputPrefix = path.join(tmpDir, 'page');

  try {
    // Scrie PDF-ul pe disc
    await fs.writeFile(inputPdfPath, pdfBuffer);

    // Găsește calea către pdftoppm
    const pdftoppmPath = await findPdfToPpmPath();
    console.log(`[Poppler] Using pdftoppm at: ${pdftoppmPath}`);

    // Rulează pdftoppm -png -r 300 input.pdf page
    try {
      console.log(`[Poppler] Running pdftoppm on PDF (${pdfBuffer.length} bytes)...`);
      await execFileAsync(pdftoppmPath, ['-png', '-r', '300', inputPdfPath, outputPrefix]);
      console.log('[Poppler] pdftoppm completed successfully.');
    } catch (err: any) {
      console.error('[Poppler] Failed to run pdftoppm:', err?.message || err);
      if (err?.code === 'ENOENT') {
        throw new Error(
          'Nu s-a putut rula `pdftoppm`. Poppler nu este instalat sau nu este în PATH. ' +
          'Instalează Poppler: macOS: `brew install poppler`, Linux: `apt-get install poppler-utils`, Windows: descarcă de la https://poppler.freedesktop.org/. ' +
          'După instalare, repornește serverul Next.js.'
        );
      }
      throw new Error(
        `Nu s-a putut rula \`pdftoppm\`: ${err?.message || 'Unknown error'}. ` +
        'Asigură-te că Poppler este instalat și `pdftoppm` este în PATH.'
      );
    }

    // Citește imaginile generate (page-1.png, page-2.png, ...)
    const files = await fs.readdir(tmpDir);
    const pngFiles = files
      .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
      .sort((a, b) => {
        const aNum = parseInt(a.split('-')[1], 10);
        const bNum = parseInt(b.split('-')[1], 10);
        return aNum - bNum;
      });

    if (pngFiles.length === 0) {
      console.warn('[Poppler] pdftoppm nu a generat niciun fișier PNG.');
      return [];
    }

    const result: PopplerPageImage[] = [];

    for (const file of pngFiles) {
      const fullPath = path.join(tmpDir, file);
      const buffer = await fs.readFile(fullPath);
      const pageNumber = parseInt(file.split('-')[1], 10) || result.length + 1;
      result.push({ pageNumber, buffer });
    }

    console.log(`[Poppler] Generated ${result.length} PNG page(s) from PDF.`);

    return result;
  } finally {
    // Cleanup best-effort (nu aruncăm eroare dacă nu reușim să ștergem)
    try {
      const files = await fs.readdir(tmpDir).catch(() => []);
      await Promise.all(
        files.map((f) =>
          fs.unlink(path.join(tmpDir, f)).catch(() => {
            // ignore
          })
        )
      );
      await fs.rmdir(tmpDir).catch(() => {
        // ignore
      });
    } catch {
      // ignore cleanup errors
    }
  }
}







