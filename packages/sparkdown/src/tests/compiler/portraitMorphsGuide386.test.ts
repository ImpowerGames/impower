import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pairShapes, parsePathData, type LabelledShape } from "@impower/spark-morph/src/index";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { buildMorphMotion, MORPH_MOTION_REST, MORPH_MOTION_WRAPPER_STYLE, morphMotionProblem } from "../../morph/motion";
import { MorphTimeline, morphRandom } from "../../morph/timeline";
import type { MorphTiming } from "../../morph/types";

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
  <g data-name="eyebrows" id="eb">
    <g data-name="brow-left:brows.up:default" id="bu"/>
    <g data-name="brow-left:brows.down" id="bd"/>
  </g>
  <g data-name="nose" id="no"/>
</g>
</svg>`;

const SPLIT_LASHES = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="eyelash-left:eyes.open:default" id="la"/>
<g data-name="eyelash-left:eyes.closed" id="lc"/>
<g data-name="eyelash-top-right:eyes.open:default" id="rt"/>
<g data-name="eyelash-top-right:eyes.closed" id="rtc"/>
<g data-name="eyelash-bottom-right:eyes.open:default" id="rb"/>
<g data-name="eyelash-bottom-right:eyes.closed" id="rbc"/>
<g data-name="brow-left:brows.up:default" id="bu"/>
<g data-name="brow-left:brows.down" id="bd"/>
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

  test("the pose a finished morph holds follows its direction, as the chapter says", () => {
    const endOffset = (direction: MorphTiming["direction"], iterations: number) => {
      const timing: MorphTiming = { duration: 0.25, delay: 0, easing: "linear", iterations, direction };
      const head = new MorphTimeline(timing, morphRandom("guide")).at(10);
      return head.phase === "done" ? head.offset : head.phase;
    };
    expect(endOffset("normal", 1)).toBe(1);
    expect(endOffset("reverse", 1)).toBe(0);
    expect(endOffset("alternate", 2)).toBe(0);
    expect(endOffset("alternate", 3)).toBe(1);
    const reverse = new MorphTimeline(
      { duration: 0.25, delay: 0, easing: "linear", iterations: 1, direction: "reverse" },
      morphRandom("guide"),
    ).at(0.0001);
    expect(reverse.phase === "playing" && reverse.offset).toBeGreaterThan(0.99);
    expect(chapter()).toContain("This check uses the first pose whatever the `direction`, though a `reverse` play begins from the last pose");
    expect(chapter()).not.toMatch(/where the morph starts|than the morph starts from/);

    const text = chapter();
    expect(text).toContain("the last pose with the default `direction = normal`, the first with `reverse`, and for the alternating directions whichever end the final play reaches");
    expect(text).toContain("so the portrait comes back to rest whichever direction the morph plays in");
    expect(text).not.toMatch(/returns to the state it was drawn in|holds its last pose when it finishes|End on it too/);
  });

  test("examples use the brace form and the iteration delay range", () => {
    const all = examples().join("\n");
    expect(all).not.toMatch(/^morph \S+ with\b/m);
    expect(all).toContain("iteration_delay_min");
    expect(all).toContain("iteration_delay_max");
  });

  test("the moving-layers section teaches the values, rest values and order the player uses", () => {
    const text = chapter();
    const moving = examples().find((example) => example.includes("eyebrows { translate = 0 8px }"))!;
    expect(moving).toBeDefined();
    expect(diagnosticsOf(moving)).toEqual([]);
    const second = examples().find((example) => example.includes("brows { state = down }"))!;
    expect(diagnosticsOf(second)).toEqual([]);
    const late = second.replace("      brows { state = up }\n    }\n    50%", "    }\n    50%");
    expect(late).not.toBe(second);
    expect(diagnosticsOf(late).map((d) => d.message)).toContainEqual(expect.stringContaining("`brows` takes a `state` in a later keyframe but not in the first one"));
    const rest = buildMorphMotion([{ eyes: { state: "open" } }, { eyes: { state: "closed" }, nose: { translate: "0 1px", rotate: "1deg", scale: "2", transform: "skewX(1deg)", transform_origin: "left top", opacity: 0.5 } }])!;
    expect(rest["nose"]![0]!.values).toEqual(MORPH_MOTION_REST);
    for (const row of ["| `translate` |", "| `rotate` |", "| `scale` |", "| `transform` |", "| `transform_origin` |", "| `opacity` |"]) expect(text).toContain(row);
    expect(text).toMatch(/\| `translate` \|[^\n]*\| `0` \|/);
    expect(text).toMatch(/\| `rotate` \|[^\n]*\| `0deg` \|/);
    expect(text).toMatch(/\| `scale` \|[^\n]*\| `1` \|/);
    expect(text).toMatch(/\| `transform` \|[^\n]*\| `none` \|/);
    expect(text).toMatch(/\| `transform_origin` \|[^\n]*\| `center` \|/);
    expect(text).toMatch(/\| `opacity` \|[^\n]*\| `1` \|/);
    expect(text).toContain("`translate`, then `rotate`, then `scale`, then `transform`, all about `transform_origin`");
    expect(MORPH_MOTION_WRAPPER_STYLE).toBe("transform-box:fill-box;transform-origin:50% 50%");
    expect(text).toContain("A percentage is of the moved layer's own box");
    expect(text).not.toMatch(/a first or last pose that leaves a group out/);
    expect(text).toContain("Every group the morph drives needs its `state` in the first pose");
    const documented = [
      ["translate", "0 8px"],
      ["translate", "-2px"],
      ["translate", "50% 0"],
      ["translate", "calc(50% + 2px)"],
      ["rotate", "5deg"],
      ["rotate", "-0.02turn"],
      ["rotate", 0],
      ["scale", "1.1"],
      ["scale", "1 0.9"],
      ["scale", "95%"],
      ["transform", "skewX(4deg) translate(0, -1px)"],
      ["transform", "rotate(90deg) translate(10px, 0)"],
      ["transform_origin", "left top"],
      ["transform_origin", "50% 100%"],
      ["transform_origin", "center bottom"],
      ["opacity", "50%"],
    ] as const;
    for (const [property, value] of documented) {
      expect(morphMotionProblem(property, value), `${property} = ${value}`).toBeNull();
    }
    for (const [property, value] of [["transform", "rotateX(30deg)"], ["translate", "0 0 5px"], ["scale", "1 1 2"], ["transform_origin", "left top 5px"], ["rotate", "x 30deg"], ["translate", "0 8"]] as const) {
      expect(morphMotionProblem(property, value), `${property} = ${value}`).not.toBeNull();
    }
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
