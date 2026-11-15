// Lists t("key") / msg("key") keys used in src/ that are missing from messages.json (exit 1 if any).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const messages = JSON.parse(readFileSync("public/_locales/en/messages.json", "utf8"));
const used = new Set();
const dynamicPrefixes = new Set();
function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f)) {
      const s = readFileSync(p, "utf8");
      for (const m of s.matchAll(/\b(?:t|msg)\(\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]);
      for (const m of s.matchAll(/\b(?:t|msg)\(\s*`([A-Za-z0-9_]+)\$\{/g)) dynamicPrefixes.add(m[1]);
      for (const m of s.matchAll(/"((?:pro|nudge)[A-Z][A-Za-z]+)"/g)) used.add(m[1]);
    }
  }
}
walk("src");
const missing = [...used].filter((k) => !(k in messages)).sort();
for (const pre of dynamicPrefixes) if (!Object.keys(messages).some((k) => k.startsWith(pre))) missing.push(pre + "*");
console.log(missing.join("\n"));
process.exit(missing.length ? 1 : 0);
