/** Render representative migrated portraits through the production SVG filter. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { buildSVGAttributeVocabulary, resolveAttributes } from "../../packages/sparkdown/src/attributes/index";
import { filterSVG } from "../../packages/sparkdown/src/compiler/utils/filterSVG";

async function main() {
  const [project, output] = process.argv.slice(2);
  if (!project || !output) throw new Error("Usage: tsx render-review.ts MIGRATED_PROJECT OUTPUT.png");
  const report = JSON.parse(readFileSync(join(project, "portrait-migration-report.json"), "utf8"));
  const examples = ["bunny_frustrated~jacket", "bunny_assertive~phone_hold_right~look_down", "raffles_hmph~coat", "bunny_unimpressed~phone_hold_hand"];
  const tiles = [];
  for (const [index, token] of examples.entries()) {
    const entry = report.directives[token];
    const base = report.directives[entry.base];
    const attributes = [...(base?.baseAttributes ?? []), ...entry.attributes];
    const source = readFileSync(join(project, "assets", `${entry.root}.svg`), "utf8");
    const selection = resolveAttributes(buildSVGAttributeVocabulary(source), attributes).selection;
    const svg = filterSVG(source, selection);
    const portrait = await sharp(Buffer.from(svg)).resize(700, 570, { fit: "contain", background: "#f5f1e8" }).png().toBuffer();
    tiles.push({ input: portrait, left: (index % 2) * 720, top: Math.floor(index / 2) * 630 + 40 });
    const caption = `<svg width="710" height="40"><text x="12" y="26" font-size="16" fill="#222">${entry.converted}</text></svg>`;
    tiles.push({ input: Buffer.from(caption), left: (index % 2) * 720, top: Math.floor(index / 2) * 630 });
  }
  await sharp({ create: { width: 1440, height: 1260, channels: 4, background: "#f5f1e8" } }).composite(tiles).png().toFile(output);
  console.log(output);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
