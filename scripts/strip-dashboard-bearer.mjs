/**
 * Elimină `Authorization: Bearer` din fetch-uri same-origin (dashboard + header).
 * Rulează: node scripts/strip-dashboard-bearer.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const targets = [
  path.join(root, "app/(site)/dashboard"),
  path.join(root, "app/admin"),
  path.join(root, "components/UniversalHeader.tsx"),
];

let files = [];
for (const t of targets) {
  if (t.endsWith(".tsx")) {
    if (fs.existsSync(t)) files.push(t);
  } else {
    files.push(...walk(t));
  }
}

for (const file of files) {
  let s = fs.readFileSync(file, "utf8");
  const orig = s;

  // Spread-uri opționale cu Authorization
  s = s.replace(
    /,\s*\.\.\.\([^)]*\?\s*\{[^}]*Authorization[^}]*\}\s*:\s*\{\}\)/gs,
    "",
  );
  s = s.replace(
    /\s*\.\.\.\([^)]*\?\s*\{[^}]*Authorization[^}]*\}\s*:\s*\{\}\)/gs,
    "",
  );

  // Linii cu doar Authorization (quote variate)
  s = s.replace(
    /\n[ \t]*['"]Authorization['"]:\s*`Bearer \$\{[^}]+\}`[,\r\n]*/g,
    "\n",
  );
  s = s.replace(
    /\n[ \t]*authorization:\s*`Bearer \$\{[^}]+\}`[,\r\n]*/gi,
    "\n",
  );
  s = s.replace(
    /\n[ \t]*headers:\s*\{\s*Authorization:\s*`Bearer \$\{[^}]+\}`\s*\}[,\r\n]*/g,
    "\n",
  );

  // Obiect headers doar cu Authorization
  s = s.replace(
    /\{\s*Authorization:\s*`Bearer \$\{[^}]+\}`\s*\}/g,
    "{}",
  );

  if (s !== orig) {
    fs.writeFileSync(file, s);
    console.log("updated:", path.relative(root, file));
  }
}
