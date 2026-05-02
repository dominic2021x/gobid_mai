import fs from "fs";
import path from "path";
import { marked } from "marked";

const LEGAL_DIR = path.join(process.cwd(), "legal");

const SLUG_TO_FILE: Record<string, string> = {
  "termeni-si-conditii": "termeni-si-conditii.md",
  "politica-confidentialitate": "politica-confidentialitate.md",
  "politica-cookies": "politica-cookies.md",
  "politica-licitatii": "politica-licitatii.md",
  "politica-plati": "politica-plati-si-rambursari.md",
  "politica-plati-si-rambursari": "politica-plati-si-rambursari.md",
  "politica-moderare": "politica-moderare-si-continut-interzis.md",
  "politica-moderare-si-continut-interzis": "politica-moderare-si-continut-interzis.md",
  "politica-ai": "politica-ai-si-utilizare-asistent.md",
  "politica-ai-si-utilizare-asistent": "politica-ai-si-utilizare-asistent.md",
  "politica-consumatori": "politica-drepturi-consumatori.md",
  "politica-drepturi-consumatori": "politica-drepturi-consumatori.md",
  "termeni-import-sursa-externa": "termeni-import-sursa-externa.md",
};

export async function getLegalContent(slug: keyof typeof SLUG_TO_FILE | string): Promise<string> {
  const file = SLUG_TO_FILE[slug] ?? `${slug}.md`;
  const filePath = path.join(LEGAL_DIR, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Legal document not found: ${slug}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

/** Returnează conținutul legal ca HTML (pentru randare cu dangerouslySetInnerHTML) */
export async function getLegalHtml(slug: keyof typeof SLUG_TO_FILE | string): Promise<string> {
  const md = await getLegalContent(slug);
  return marked.parse(md) as string;
}

