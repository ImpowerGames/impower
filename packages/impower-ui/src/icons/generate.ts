import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const svgDir = resolve(here, "svg");
const outPath = resolve(here, "../components/icon/icons.generated.tsx");

const files = (await readdir(svgDir))
  .filter((f) => extname(f).toLowerCase() === ".svg")
  .sort((a, b) => a.localeCompare(b));

const pascalCase = (kebab: string): string =>
  kebab
    .split("-")
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join("");

const parseAttrs = (raw: string): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
    out.push([m[1]!, m[2]!]);
  }
  return out;
};

interface ParsedIcon {
  name: string;
  component: string;
  attrs: Array<[string, string]>;
  inner: string;
}

const parsed: ParsedIcon[] = [];
for (const file of files) {
  const name = basename(file, ".svg");
  const svg = (await readFile(resolve(svgDir, file), "utf8")).trim();
  const m = svg.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/);
  if (!m) {
    console.warn(`Skipping ${file}: could not parse <svg>`);
    continue;
  }
  parsed.push({
    name,
    component: pascalCase(name),
    attrs: parseAttrs(m[1]!),
    inner: m[2]!.trim(),
  });
}

const renderAttrs = (attrs: Array<[string, string]>): string =>
  attrs.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");

const components = parsed
  .map(({ component, attrs, inner }) => {
    const attrStr = renderAttrs(attrs);
    const escapedInner = JSON.stringify(inner);
    // Default to decorative: aria-hidden, focusable=false. Consumers can
    // override via props (spread comes after literals) for labelled icons:
    //   <Check role="img" aria-label="confirm" />
    return `export const ${component}: IconComponent = (props) => (
  <svg ${attrStr} aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: ${escapedInner} }} />
);`;
  })
  .join("\n\n");

const out = `// This file is generated. Do not edit by hand.
// Run \`npm run gen:icons\` from packages/impower-ui to regenerate.
// Source: src/icons/svg/*.svg

import type preact from "preact";
import type { JSX } from "preact";

export type IconComponent = (
  props?: preact.SVGAttributes<SVGSVGElement>,
) => JSX.Element;

${components}
`;

await writeFile(outPath, out, "utf8");
console.log(`Wrote ${parsed.length} icons to ${outPath}`);
