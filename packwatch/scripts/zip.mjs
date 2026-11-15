// Packs dist/ (the production build) into packwatch-<version>.zip with manifest.json at the root.
// Usage: npm run zip
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
if (manifest.host_permissions?.length) {
  console.error("dist/manifest.json has host_permissions: this looks like a dev build. Run `npm run build`.");
  process.exit(1);
}
const out = join(root, `packwatch-${manifest.version}.zip`);
if (existsSync(out)) rmSync(out);
execFileSync("zip", ["-qrX", out, ".", "-x", ".*", "*.map"], { cwd: dist, stdio: "inherit" });
console.log(`wrote ${out}`);
