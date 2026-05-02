/**
 * Replaces client fetch() calls to /api/* under app/(site)/dashboard with dashboardApiFetch().
 * Skips dashboardApiFetch (negative lookbehind before "fetch").
 */
import fs from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "app/(site)/dashboard");

const RE = /(?<![a-zA-Z])fetch\s*\(\s*(["'`])\/api\//g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name) && !ent.name.endsWith(".backup")) out.push(p);
  }
  return out;
}

function hasDashboardImport(src) {
  return /from\s+["']@\/lib\/dashboard-api-fetch["']/.test(src);
}

function addImport(src) {
  const line = 'import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";\n';
  const useClient = src.match(/^(['"])use client\1;?\s*\r?\n/);
  if (useClient) {
    const end = useClient[0].length;
    return src.slice(0, end) + (src[end] === "\n" && !src.slice(end).startsWith("\n") ? "" : "") + line + src.slice(end);
  }
  return line + src;
}

function transform(src) {
  return src.replace(RE, "dashboardApiFetch($1/api/");
}

const files = walk(ROOT);
let changed = [];
for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  const next = transform(src);
  if (next === src) continue;
  let out = next;
  if (!hasDashboardImport(out)) out = addImport(out);
  fs.writeFileSync(file, out);
  changed.push(path.relative(process.cwd(), file));
}

console.log(JSON.stringify({ count: changed.length, files: changed }, null, 2));
