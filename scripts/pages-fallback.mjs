import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const candidates = [
  "dist/client/index.html",
  "dist/index.html",
  ".output/public/index.html",
  ".vercel/output/static/index.html",
];

const file = candidates.find((path) => existsSync(path));
if (!file) {
  console.error("pages: index.html not found in", candidates.join(", "));
  process.exit(1);
}

const html = readFileSync(file, "utf8")
  .replaceAll('href="/__grok/manifest.webmanifest"', 'href="/stl-viewer/manifest.webmanifest"')
  .replaceAll('href="/__grok/icon-180.png"', 'href="/stl-viewer/__grok/icon-180.png"');

writeFileSync(file, html);
copyFileSync(file, join(dirname(file), "404.html"));
console.log(`pages: ${file}`);
