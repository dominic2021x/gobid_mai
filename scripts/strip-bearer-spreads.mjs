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

const files = [
  ...walk(path.join(root, "app/(site)/dashboard")),
  ...walk(path.join(root, "app/admin")),
  path.join(root, "components/UniversalHeader.tsx"),
].filter((f) => fs.existsSync(f));

const patterns = [
  /\s*\.\.\.\(accessToken \? \{ 'Authorization': `Bearer \$\{accessToken\}` \} : \{\}\)/g,
  /\s*\.\.\.\(accessToken \? \{ Authorization: `Bearer \$\{accessToken\}` \} : \{\}\)/g,
  /\s*\.\.\.\(session\?\.access_token \? \{ 'Authorization': `Bearer \$\{session\.access_token\}` \} : \{\}\)/g,
  /\s*\.\.\.\(session\?\.access_token \? \{ Authorization: `Bearer \$\{session\.access_token\}` \} : \{\}\)/g,
  /\s*\.\.\.\(refreshedAccessToken \? \{ Authorization: `Bearer \$\{refreshedAccessToken\}` \} : \{\}\)/g,
  /\s*\.\.\.\(refreshedAccessToken \? \{ 'Authorization': `Bearer \$\{refreshedAccessToken\}` \} : \{\}\)/g,
];

for (const file of files) {
  let s = fs.readFileSync(file, "utf8");
  const orig = s;
  for (const p of patterns) s = s.replace(p, "");
  if (s !== orig) fs.writeFileSync(file, s);
}
