import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { buildSVGAttributeVocabulary } from "../../attributes";

it.each(["svg", "SVG"])("the native Node optimizer preserves Affinity labels as engine-readable names for .%s exports", (extension) => {
  const dir = mkdtempSync(join(tmpdir(), "portrait-optimizer-normalization-"));
  try {
    const input = join(dir, `portrait.${extension}`);
    const output = join(dir, "normalized.svg");
    writeFileSync(input, '<svg xmlns="http://www.w3.org/2000/svg" xmlns:serif="http://www.serif.com/" width="10" height="10"><g id="legacy" serif:id="hat.on"><path d="M0 0L10 0L10 10Z"/></g></svg>');
    execFileSync(process.execPath, [resolve("../animated-svg-optimizer/scripts/optimize.ts"), input, output], {encoding: "utf8"});
    const svg = readFileSync(output, "utf8");
    expect(svg).toContain('data-name="hat.on"');
    expect(svg).toContain('id="legacy"');
    expect(buildSVGAttributeVocabulary(svg).groups["hat"]?.switch).toBe(true);
  } finally {
    if (!resolve(dir).startsWith(resolve(tmpdir()) + "\\portrait-optimizer-normalization-") && !resolve(dir).startsWith(resolve(tmpdir()) + "/portrait-optimizer-normalization-")) throw new Error("Unexpected temporary directory");
    rmSync(dir, {recursive: true, force: true});
  }
});
