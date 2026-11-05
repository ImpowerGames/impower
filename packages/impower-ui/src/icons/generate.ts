import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const svgDir = resolve(here, "svg");
const componentsPath = resolve(here, "../components/icon/icons.generated.tsx");
const masksPath = resolve(here, "../components/icon/icon-masks.generated.ts");

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
  svg: string;
  attrs: Array<[string, string]>;
  inner: string;
}

const problems: string[] = [];
const parsed: ParsedIcon[] = [];
for (const file of files) {
  const name = basename(file, ".svg");
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    problems.push(`${file}: the name is not kebab-case`);
    continue;
  }
  const svg = (await readFile(resolve(svgDir, file), "utf8")).trim();
  const m = svg.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/);
  if (!m) {
    problems.push(`${file}: could not parse <svg>`);
    continue;
  }
  const attrs = parseAttrs(m[1]!);
  if (!attrs.some(([k, v]) => k === "viewBox" && v === "0 0 24 24")) {
    problems.push(`${file}: the viewBox is not the 24px grid`);
  }
  parsed.push({
    name,
    component: `${pascalCase(name)}Icon`,
    svg,
    attrs,
    inner: m[2]!.trim(),
  });
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const renderAttrs = (attrs: Array<[string, string]>): string =>
  attrs.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");

const components = parsed
  .map(({ component, attrs, inner }) => {
    const attrStr = renderAttrs(attrs);
    const escapedInner = JSON.stringify(inner);
    return `export const ${component}: IconComponent = (props) => (
  <svg ${attrStr} aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: ${escapedInner} }} />
);`;
  })
  .join("\n\n");

await writeFile(
  componentsPath,
  `import type preact from "preact";
import type { JSX } from "preact";

export type IconComponent = (
  props?: preact.SVGAttributes<SVGSVGElement>,
) => JSX.Element;

${components}
`,
  "utf8",
);

const masks = parsed
  .map(
    ({ name, svg }) =>
      `  ${JSON.stringify(name)}: ${JSON.stringify(`url('data:image/svg+xml,${encodeURIComponent(svg)}')`)},`,
  )
  .join("\n");

await writeFile(
  masksPath,
  `export const iconMasks = {
${masks}
} as const;

export type IconName = keyof typeof iconMasks;
`,
  "utf8",
);

console.log(`Wrote ${parsed.length} icons to ${componentsPath} and ${masksPath}`);
