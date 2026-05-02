/**
 * Ensures app/api route handlers export dynamic + fetchCache for strict no-store routing.
 */
import fs from "fs";
import path from "path";

const API_ROOT = path.join(process.cwd(), "app/api");

const BLOCK = `export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';`;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "route.ts") out.push(p);
  }
  return out;
}

function insertAfterImports(src) {
  const lines = src.split(/\n/);
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) lastImport = i;
  }
  const at = lastImport >= 0 ? lastImport + 1 : 0;
  return [...lines.slice(0, at), "", BLOCK, "", ...lines.slice(at)].join("\n");
}

const routes = walk(API_ROOT);
const changed = [];

for (const file of routes) {
  let src = fs.readFileSync(file, "utf8");
  const hasDyn = /export const dynamic\s*=\s*['"]force-dynamic['"]/.test(src);
  const hasFetch = /export const fetchCache\s*=\s*['"]force-no-store['"]/.test(src);

  if (hasDyn && hasFetch) continue;

  if (hasDyn && !hasFetch) {
    src = src.replace(
      /(export const dynamic\s*=\s*['"]force-dynamic['"];?)\s*/g,
      "$1\nexport const fetchCache = 'force-no-store';\n"
    );
    if (!/export const fetchCache\s*=\s*['"]force-no-store['"]/.test(src)) {
      console.error("Failed to add fetchCache:", file);
      process.exit(1);
    }
  } else {
    src = insertAfterImports(src);
  }

  fs.writeFileSync(file, src);
  changed.push(path.relative(process.cwd(), file));
}

console.log(JSON.stringify({ count: changed.length, files: changed }, null, 2));
