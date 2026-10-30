import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const svgDir = resolve(here, "svg");
const VERSION = "3.31.0";

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("Pass at least one icon name, e.g. file-type-csv");
  process.exit(1);
}

for (const name of names) {
  const url = `https://unpkg.com/@tabler/icons@${VERSION}/icons/outline/${name}.svg`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ ${name}: HTTP ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  const raw = await res.text();
  const seen = new Set();
  const ds = [];
  for (const m of raw.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = m[1];
    if (/stroke\s*=\s*"none"/.test(attrs)) continue;
    const dm = attrs.match(/\bd\s*=\s*"([^"]*)"/);
    if (!dm) continue;
    const d = dm[1].trim();
    if (seen.has(d)) continue;
    seen.add(d);
    ds.push(d);
  }
  const merged = ds.join(" ");
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${merged}" /></svg>\n`;
  await writeFile(resolve(svgDir, `${name}.svg`), out, "utf8");
  console.log(`✓ ${name} (${ds.length} paths)`);
}
