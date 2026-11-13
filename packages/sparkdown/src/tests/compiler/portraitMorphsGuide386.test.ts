import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pairShapes, parsePathData, type LabelledShape } from "@impower/spark-morph/src/index";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { buildMorphMotion, MORPH_MOTION_REST, MORPH_MOTION_WRAPPER_STYLE, morphMotionProblem } from "../../morph/motion";
import { bakeMorphArtifact } from "../../morph/bake";
import { buildMorphRecipe } from "../../morph/recipe";
import { MorphTimeline, morphRandom } from "../../morph/timeline";
import type { MorphArtifact, MorphTiming } from "../../morph/types";
import { blink, maskedBlink, maskedPortrait, MASKED_VARIANTS, partnerPortrait, portrait, spreadBlink, spreadPortrait } from "../morph/fixtures";

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
  <g data-name="masked-nose:mask.on" id="mn"/>
  <g data-name="lips:mouth.closed:default" id="mc"/>
  <g data-name="lips:mouth.open" id="mo"/>
  <g data-name="lips:mouth.teeth" id="mt"/>
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

const TALKING_DEFINE = "define raffles as character";

function talkingDiagnostics(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      { uri: "file:///raffles@confident.svg", type: "image", name: "raffles@confident", ext: "svg", data: PORTRAIT },
      { uri: "file:///raffles@happy.svg", type: "image", name: "raffles@happy", ext: "svg", data: PORTRAIT },
      { uri: "file:///raffles_laugh.mp3", type: "audio", name: "raffles_laugh", ext: "mp3" },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  return (program.diagnostics?.[URI] ?? []).map((d) => ({
    message: typeof d.message === "string" ? d.message : d.message.value,
    severity: d.severity,
  }));
}

describe("the talking section of the portrait morphs guide chapter", () => {
  const talking = () => chapter().slice(chapter().indexOf("## Talking"), chapter().indexOf("## Seeing it play"));
  const script = () => examples().find((text) => text.includes(TALKING_DEFINE))!;

  test("the section's examples compile with no diagnostics", () => {
    const own = [...talking().matchAll(/^```sparkdown\n([\s\S]*?)^```$/gm)].map((m) => m[1]!);
    expect(own.length).toBeGreaterThanOrEqual(2);
    expect(own[0]).toContain(TALKING_DEFINE);
    expect(talkingDiagnostics(own[0]!)).toEqual([]);
    for (const text of own.slice(1)) expect(diagnosticsOf(text)).toEqual([]);
  });

  test("the voiced characters the section names are the built-in typewriter's", () => {
    const builtins = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../compiler/builtins/builtins.sd"), "utf8");
    expect(builtins).toContain("voiced = @/([\\p{L}\\p{N}']+)/u");
    expect(talking()).toContain("letters, digits and the apostrophe unless the typewriter sets another");
    expect(talking()).toContain("- Other punctuation, spaces");
  });

  test("the timing table lists `trigger` and Portraits links to the section", () => {
    expect(chapter()).toMatch(/\| `trigger` \| `appear` \|/);
    expect(readFileSync(resolve(GUIDE, "Portraits.md"), "utf8")).toContain("(./PortraitMorphs.md#talking)");
  });

  test("the rules the section states are the rules the compiler reports", () => {
    const text = script();
    const messages = (source: string) => talkingDiagnostics(source).map((d) => d.message);
    expect(messages(text.replace("    duration = 0.16\n    iteration_delay_min = 0", "    delay = 1\n    duration = 0.16\n    iteration_delay_min = 0"))).toEqual([
      expect.stringContaining("`delay` does not apply to a speech morph"),
      expect.stringContaining("`delay`, inherited, does not apply to a speech morph"),
    ]);
    expect(messages(text.replace("  blend = cut\n  default = true", "  blend = cut").replace("morph blink {\n", "morph blink {\n  default = true\n"))).toContainEqual(
      expect.stringContaining("this morph is not a speech morph"),
    );
    expect(messages(text.replace("morph talk_gritted]]", "morph blink]]"))).toEqual([expect.stringContaining("`blink` is not a speech morph")]);
    expect(messages(text.replace("morph talk_gritted]]", "morph talk_grin]]"))).toEqual([expect.stringContaining("No morph named `talk_grin`")]);
    expect(messages(text.replace("morph talk_gritted]]", "morph talk_smile]]"))).toEqual([expect.stringContaining("`talk_smile` plays on no image in this directive")]);
    expect(messages(text.replace("  default = true\n", ""))).toContainEqual(expect.stringContaining("none is marked `default = true`"));
  });
});

describe("the portrait morphs guide chapter", () => {
  test("has compiled examples", () => {
    expect(examples().length).toBeGreaterThanOrEqual(8);
  });

  test.each(examples().filter((text) => !text.includes(TALKING_DEFINE)).map((text, index) => [index + 1, text] as const))(
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

  test("the first blink's `unless` keeps a closed look silent; without it the closed choice warns, and a folder lacking a state warns on the morph", () => {
    const first = examples()[0]!;
    expect(first).toContain("unless = eyes.closed");
    expect(diagnosticsOf(first, undefined, "[[mia:eyes.closed]]")).toEqual([]);
    const plain = first.replace("  unless = eyes.closed\n", "");
    const overridden = diagnosticsOf(plain, undefined, "[[mia:eyes.closed]]");
    expect(overridden.map((d) => d.message)).toEqual([expect.stringContaining("`blink` plays on this look and rests its `eyes` on `open`")]);
    expect(diagnosticsOf(plain)).toEqual([]);
    const lacking = `<svg xmlns="http://www.w3.org/2000/svg">
<g data-name="left" id="l"><g data-name="lid:eyes.open:default" id="lo"/><g data-name="lid:eyes.closed" id="lc"/></g>
<g data-name="right" id="r"><g data-name="lid:eyes.open:default" id="ro"/></g>
</svg>`;
    const found = diagnosticsOf(first, [lacking, SPLIT_LASHES]);
    expect(found.some((d) => d.message.includes('folder "right" draws no `eyes.closed`'))).toBe(true);
  });

  test("the chapter's `rest` example rests on a state its keyframes never show, on looks its `when` admits", () => {
    const smile = examples().find((example) => example.includes("morph talk_smile"))!;
    expect(smile).toContain("when = mouth.teeth");
    expect(diagnosticsOf(smile, undefined, "[[mia:mouth.teeth]]")).toEqual([]);
    expect(chapter()).toContain("### Keeping a morph off a look");
    expect(chapter()).toContain("### Where a morph rests");
    expect(chapter()).toContain("### The look a portrait shows");
    expect(chapter()).not.toMatch(/dormant/);
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
    expect(chapter()).toContain("A morph whose first and last poses are both its rest comes back to rest seamlessly whichever direction it plays in");
    expect(chapter()).not.toMatch(/where the morph starts|than the morph starts from|first pose is the state a portrait has to rest in/);

    const text = chapter();
    expect(text).toContain("the last pose with the default `direction = normal`, the first with `reverse`, and for the alternating directions whichever end the final play reaches");
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

const bakeGuide = (source: string, recipe: ReturnType<typeof buildMorphRecipe>, selection: Record<string, string> = {}) =>
  bakeMorphArtifact({ source, selection, recipes: [recipe], key: "guide", variant: "guide", uri: "file:///guide.svg" });

const codesOf = (artifact: MorphArtifact) => artifact.diagnostics.map((d) => [d.code, d.severity]);

const shadowBlink = (partner: string[]) =>
  buildMorphRecipe("blink", {
    blend: "morph",
    method: "bend",
    fallback: "fade",
    layers: { "eyeball-shadow-left": { partner } },
    keyframes: [
      { offset: 0, eyes: { state: "open" } },
      { offset: 0.5, eyes: { state: "closed" } },
      { offset: 1, eyes: { state: "open" } },
    ],
    clips: [],
  });

describe("the art and warnings the portrait morphs guide teaches", () => {
  test("art with a style sheet, an unreadable inline style or an unreadable transform shows without the morph", () => {
    const plain = portrait();
    expect(bakeGuide(plain, blink()).status).toBe("live");
    for (const svg of [
      plain.replace("<defs>", "<defs><style></style>"),
      plain.replace("<defs>", '<defs><link rel="stylesheet" href="theme.css"/>'),
      `<?xml-stylesheet href="theme.css"?>\n${plain}`,
      `<!DOCTYPE svg [<!ENTITY x "x">]>\n${plain}`,
      plain.replace('data-name="nose"', 'data-name="nose" style="fill:var(--nose)"'),
      plain.replace('data-name="nose"', 'data-name="nose" transform="rotate(10deg)"'),
    ]) {
      const artifact = bakeGuide(svg, blink());
      expect(artifact.status, svg).not.toBe("live");
      expect(artifact.diagnostics, svg).toEqual([expect.objectContaining({ severity: "error" })]);
      expect(artifact.diagnostics[0]!.message, svg).toContain("shows without the morph");
    }
    const text = chapter();
    expect(text).toContain("### Art the morph can read");
    expect(text).toContain("An artwork the morph cannot read safely shows without the morph, still, with an error on the artwork file");
    expect(text).toContain("- A style sheet: a `<style>` or `<link>` element anywhere in the file, even an empty one or one whose rules touch nothing, an `<?xml-stylesheet ?>` instruction, or a `<!DOCTYPE>` with an internal subset");
    expect(text).toContain("one using `all`, `var()`, comments, escapes, character references or strings");
    expect(text).toContain("- A `transform` attribute the morph cannot read: the six SVG transform functions with plain numbers are read");
    expect(readFileSync(resolve(GUIDE, "Portraits.md"), "utf8")).toContain("(./PortraitMorphs.md#art-the-morph-can-read)");
  });

  test("a shape with geometry or a transform the bake cannot follow fades while the rest moves", () => {
    for (const [attrs, code] of [
      [' r="1em"', "unsupported-element"],
      [' r="4" style="r:8"', "unsupported-element"],
      [' r="4" style="transform:translate(5px,0)"', "unsupported-transform"],
      [' r="4" transform="rotate(10)" transform-origin="50 50"', "unsupported-transform"],
    ] as const) {
      const svg = portrait().replace('<g data-name="eyes.open:default">', `<g data-name="eyes.open:default">\n<circle data-name="glint" cx="50" cy="40"${attrs} fill="blue"/>`);
      const artifact = bakeGuide(svg, blink({ layers: { glint: { fallback: "scale" } } }));
      expect(artifact.status, attrs).toBe("live");
      expect(codesOf(artifact), attrs).toContainEqual([code, "warning"]);
      expect(artifact.diagnostics.find((d) => d.code === code)!.message, attrs).toContain("fades instead of moving");
    }
    expect(chapter()).toContain("A single shape the morph cannot follow fades instead of moving, with a warning naming its layer, while the rest of the portrait still moves");
  });

  test("`spread` grows and shrinks fills only, and shrinks a single contour that does not overlap itself and has no mask of its own", () => {
    const why = (label: string, spread: string) =>
      bakeGuide(spreadPortrait(), spreadBlink({ [label]: { spread } })).diagnostics.filter((d) => d.code === "spread-ignored").map((d) => d.message);
    expect(why("flat", "-1px")).toEqual([]);
    expect(why("flat", "1px")).toEqual([]);
    expect(why("stroked", "1px")).toEqual([expect.stringContaining("grows or shrinks fills only")]);
    expect(why("patterned", "1px")).toEqual([expect.stringContaining("a pattern")]);
    expect(why("mottled", "1px")).toEqual([expect.stringContaining("a gradient whose stops differ in opacity")]);
    expect(why("polylined", "1px")).toEqual([expect.stringContaining("`polyline`")]);
    expect(why("doubled", "-1px")).toEqual([expect.stringContaining("more than one contour")]);
    expect(why("looped", "-1px")).toEqual([expect.stringContaining("overlaps itself")]);
    expect(why("masked", "-1px")).toEqual([expect.stringContaining("its own `mask`")]);
    expect(why("still", "-1px")).toEqual([expect.stringContaining("none of its drawings is drawn between poses")]);
    const text = chapter();
    expect(text).toContain("`spread` grows or shrinks fills only: a drawing that paints a stroke, its own or a `paints` entry's, keeps its own size");
    expect(text).toContain("Growing also skips a fill that is a pattern or a gradient whose stops differ in opacity, and a `polyline`");
    expect(text).toContain("A drawing shrinks only when it is a single contour that does not overlap itself and has no `mask` of its own");
    expect(text).toContain("- A `spread-ignored` warning:");
  });

  test("a `partner` list is read in priority order, the first listed label the pose draws deciding", () => {
    const partnerTracks = (artifact: MorphArtifact) =>
      artifact.segments[0]!.transitions.filter((t) => t.kind === "morph" && "partner" in t && t.partner);
    const ownFirst = bakeGuide(partnerPortrait({ closedShadow: true }), shadowBlink(["eyeball-shadow-left", "eyelash-left"]));
    expect(ownFirst.diagnostics).toEqual([]);
    expect(partnerTracks(ownFirst)).toEqual([]);
    const lashFirst = bakeGuide(partnerPortrait({ closedShadow: true }), shadowBlink(["eyelash-left", "eyeball-shadow-left"]));
    expect(lashFirst.diagnostics).toEqual([]);
    expect(partnerTracks(lashFirst).length).toBeGreaterThan(0);
    const skipsUndrawn = bakeGuide(partnerPortrait(), shadowBlink(["eyelash-top-left", "eyelash-left"]));
    expect(skipsUndrawn.diagnostics).toEqual([]);
    expect(partnerTracks(skipsUndrawn).length).toBeGreaterThan(0);
    const text = chapter();
    expect(text).toContain("`partner` may also list several labels in priority order. In each pose the first listed label that pose draws decides");
    expect(examples().some((example) => example.includes("eyeball-shadow-right {") && example.includes("eyelash-right\n        eyelash-top-right"))).toBe(true);
  });

  test("the troubleshooting list covers the warnings the bake reports", () => {
    const missing = bakeGuide(partnerPortrait(), shadowBlink(["eyelash-top-left"]));
    expect(codesOf(missing)).toEqual([["partner-missing", "warning"]]);
    const depth = bakeGuide(portrait(), blink({ layers: { "eyelash-left": { depth: "mouth.open" } } }));
    expect(codesOf(depth)).toContainEqual(["depth-ignored", "warning"]);
    const paints = bakeGuide(
      maskedPortrait(),
      maskedBlink([{ targets: ["eyelash-right"], state: "eyes.closed", when: "mask.on", fill: "#ccc" }]),
      { ...MASKED_VARIANTS.masked },
    );
    expect(codesOf(paints)).toEqual([["paint-target-missing", "warning"]]);
    const text = chapter();
    const troubleshooting = text.slice(text.indexOf("## When something looks wrong"), text.indexOf("## The reference project"));
    for (const code of ["spread-ignored", "depth-ignored", "partner-missing", "paint-target-missing"]) {
      expect(troubleshooting).toContain(`- A \`${code}\` warning:`);
    }
    expect(troubleshooting).toContain("- A portrait that shows still with an error on the artwork:");
    expect(troubleshooting).toContain("- A single shape that fades instead of moving:");
  });
});
