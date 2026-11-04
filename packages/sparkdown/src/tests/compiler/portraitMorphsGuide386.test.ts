import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pairShapes, parsePathData, type LabelledShape } from "@impower/spark-morph/src/index";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const GUIDE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/guide");
const CHAPTER = resolve(GUIDE, "PortraitMorphs.md");
const URI = "file:///main.sd";

const PORTRAIT = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="face.happy:default" id="happy">
  <g data-name="eyelash-left:eyes.open:default" id="la"/>
  <g data-name="eyelash-left:eyes.closed" id="lc"/>
  <g data-name="eyelash-right:eyes.open:default" id="ra"/>
  <g data-name="eyelash-right:eyes.closed" id="rc"/>
  <g data-name="eyeball-white-left:eyes.open" id="wl"/>
  <g data-name="eyeball-shadow-left:eyes.open" id="sl"/>
  <g data-name="pupil-left:eyes.open" id="pl"/>
  <g data-name="eyeball-white-right:eyes.open" id="wr"/>
  <g data-name="eyeball-shadow-right:eyes.open" id="sr"/>
  <g data-name="pupil-right:eyes.open" id="pr"/>
  <g data-name="shine:eyes.open" id="sh"/>
  <g data-name="creases" id="cr"/>
  <g data-name="glasses:mask.on" id="gl"/>
</g>
</svg>`;

const SPLIT_LASHES = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="eyelash-left:eyes.open:default" id="la"/>
<g data-name="eyelash-left:eyes.closed" id="lc"/>
<g data-name="eyelash-top-right:eyes.open:default" id="rt"/>
<g data-name="eyelash-top-right:eyes.closed" id="rtc"/>
<g data-name="eyelash-bottom-right:eyes.open:default" id="rb"/>
<g data-name="eyelash-bottom-right:eyes.closed" id="rbc"/>
</svg>`;

const chapter = () => readFileSync(CHAPTER, "utf8");

const examples = (): string[] =>
  [...chapter().matchAll(/^```sparkdown\n([\s\S]*?)^```$/gm)].map((m) => m[1]!);

function diagnosticsOf(text: string, portraits = [PORTRAIT, SPLIT_LASHES], shown = "[[mia]]") {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: `${text}\nscene start\n  ${shown}\nend\n`, version: 1, languageId: "sparkdown" },
      { uri: "file:///mia.svg", type: "image", name: "mia", ext: "svg", data: portraits[0]! },
      { uri: "file:///raffles.svg", type: "image", name: "raffles", ext: "svg", data: portraits[1]! },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  return (program.diagnostics?.[URI] ?? []).map((d) => ({
    message: typeof d.message === "string" ? d.message : d.message.value,
    severity: d.severity,
    line: d.range.start.line,
  }));
}

describe("the portrait morphs guide chapter", () => {
  test("has compiled examples", () => {
    expect(examples().length).toBeGreaterThanOrEqual(8);
  });

  test.each(examples().map((text, index) => [index + 1, text] as const))(
    "example %i compiles against the shipped compiler with no diagnostics",
    (_index, text) => {
      expect(diagnosticsOf(text)).toEqual([]);
    },
  );

  test("a skipped label edit is reported where the morph names the label", () => {
    const clip = examples().find((text) => text.includes("clips {"))!;
    const found = diagnosticsOf(clip, [PORTRAIT, SPLIT_LASHES].map((svg) => svg.replaceAll("eyelash-left:", "lash-left:")));
    expect(found.map((d) => d.message)).toContain("No image the morph applies to has a layer labelled `eyelash-left`.");
  });

  test("a look resting closed is dormant and silent, and folders resting apart warn on the morph", () => {
    const first = examples()[0]!;
    expect(diagnosticsOf(first, undefined, "[[mia:eyes.closed]]")).toEqual([]);
    const apart = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="left" id="l"><g data-name="lid:eyes.open:default" id="lo"/><g data-name="lid:eyes.closed" id="lc"/></g>
<g data-name="right" id="r"><g data-name="lid:eyes.closed:default" id="rc"/><g data-name="lid:eyes.open" id="ro"/></g>
</svg>`;
    const found = diagnosticsOf(first, [apart, SPLIT_LASHES]);
    expect(found.some((d) => d.message.includes("rest in different `eyes` states"))).toBe(true);
  });

  test("the pairing the chapter describes is the pairing the bake runs", () => {
    const at = (id: string, label: string, y: number): LabelledShape => ({
      id,
      label,
      subpaths: parsePathData(`M 0 ${y} L 10 ${y} L 10 ${y + 1} Z`),
    });
    const reordered = pairShapes(
      [at("open-top", "eyelash-left", 0), at("open-bottom", "eyelash-left", 20)],
      [at("closed-bottom", "eyelash-left", 21), at("closed-top", "eyelash-left", 1)],
    );
    expect(reordered.pairs.map((p) => [p.from.id, p.to.id]).sort()).toEqual([
      ["open-bottom", "closed-bottom"],
      ["open-top", "closed-top"],
    ]);
    const shared = pairShapes(
      [at("top", "eyelash-right", 0), at("bottom", "eyelash-right", 20)],
      [at("closed", "eyelash-right", 10)],
    );
    expect(shared.pairs.map((p) => p.from.id).sort()).toEqual(["bottom", "top"]);
    const uneven = pairShapes(
      [at("a", "creases", 0), at("b", "creases", 5)],
      [at("c", "creases", 0), at("d", "creases", 5), at("e", "creases", 9)],
    );
    expect(uneven.pairs).toEqual([]);
    expect(uneven.unpaired.every((u) => u.reason === "count-mismatch")).toBe(true);
    const renamed = pairShapes([at("lash", "lash-left", 0)], [at("lid", "lid-left", 0)]);
    expect(renamed.pairs).toEqual([]);

    const text = chapter();
    expect(text).toContain("they pair by position: the two drawings nearest each other pair first");
    expect(text).toContain("does not pair at all: each of its drawings uses the fallback, with a warning on the artwork");
    expect(text).toContain("through the morph's `fallback` instead, a fade unless the morph sets another");
    expect(text).not.toMatch(/fixed order|each fades out or in/);
  });

  test("the chapter does not promise that every morph ends at rest", () => {
    const text = chapter();
    expect(text).toContain("one that ends elsewhere holds its last pose when it finishes");
    expect(text).not.toContain("returns to the state it was drawn in");
  });

  test("examples use the brace form and the iteration delay range", () => {
    const all = examples().join("\n");
    expect(all).not.toMatch(/^morph \S+ with\b/m);
    expect(all).toContain("iteration_delay_min");
    expect(all).toContain("iteration_delay_max");
    expect(all).not.toMatch(/\btranslate\s*=/);
  });

  test("every relative link in the chapter names a guide file that exists", () => {
    const links = [...chapter().matchAll(/\]\(\.\/([^)#]+)(?:#[^)]*)?\)/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(existsSync(resolve(GUIDE, link)), link).toBe(true);
  });

  test("the guide index, Portraits and Animation link to the chapter", () => {
    for (const file of ["README.md", "Portraits.md", "AnimationTheme.md"]) {
      expect(readFileSync(resolve(GUIDE, file), "utf8"), file).toContain("(./PortraitMorphs.md)");
    }
  });

  test("its prose keeps one line per paragraph and no emphasis", () => {
    const prose = chapter().replace(/^```[\s\S]*?^```$/gm, "");
    expect(prose).not.toMatch(/\*\*|__|(^|\s)\*[^\s*]/m);
    const paragraphs = prose.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      if (/^(\||- |#)/.test(paragraph)) continue;
      expect(paragraph.includes("\n"), paragraph).toBe(false);
    }
  });
});
