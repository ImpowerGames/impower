import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../morph/bake";
import {
  buildMorphMotion,
  morphMotionCss,
  morphMotionKeyframes,
  morphMotionLabels,
  morphMotionProblem,
  type MorphMotionProperty,
} from "../../morph/motion";
import { buildMorphRecipe, parseMorphRecipe, serializeMorphRecipe } from "../../morph/recipe";
import { parse as parseXml, type Node } from "../../txml/txml";
import { CLOSED, EYEBALL, LOWER_OPEN, PUPIL, UPPER_OPEN } from "./fixtures";

const FACE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160" width="200" height="160">
<defs>
<linearGradient id="skin"><stop offset="0" stop-color="#fdb"/><stop offset="1" stop-color="#ca8"/></linearGradient>
<linearGradient id="ink"><stop offset="0" stop-color="#321"/><stop offset="1" stop-color="#543"/></linearGradient>
</defs>
<path data-name="face" d="M0,0H200V160H0Z" fill="url(#skin)"/>
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${EYEBALL}" fill="#fff"/>
<path data-name="pupil-left" d="${PUPIL}" fill="#234"/>
<path data-name="eyelash-left" d="${UPPER_OPEN}" fill="#111"/>
<path data-name="eyelash-left" d="${LOWER_OPEN}" fill="#111"/>
</g>
<g data-name="eyes.closed">
<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>
</g>
<path data-name="cheek" d="M10,90H40V100H10Z" fill="#f99"/>
<g data-name="eyebrows" transform="translate(0 2)">
<path data-name="brow-left:brows.up:default" d="M10,10H90V16H10Z" fill="url(#ink)"/>
<path data-name="brow-left:brows.up-high" d="M10,4H90V10H10Z" fill="url(#ink)"/>
<path data-name="brow-left:brows.down" d="M10,18H90V24H10Z" fill="url(#ink)"/>
</g>
<path data-name="hair" d="M0,0H200V6H0Z" fill="#432"/>
<path data-name="nose" d="M120,100L130,120L110,120Z" fill="#a76" transform="rotate(3 120 110)"/>
<path data-name="chin" d="M80,150H120V158H80Z" fill="#c96"/>
</svg>`;

const KEYFRAMES = [
  { offset: 0, eyes: { state: "open" }, brows: { state: "up" }, eyebrows: { translate: "0 0" } },
  {
    offset: 0.333,
    eyes: { state: "closed" },
    brows: { state: "down" },
    eyebrows: { translate: "0 8px" },
    nose: { translate: "0 -2px", rotate: "2deg", transform_origin: "left top" },
  },
  { offset: 1, eyes: { state: "open" }, brows: { state: "up" }, eyebrows: { translate: "0 0" } },
];

const recipeOf = (overrides: Record<string, unknown> = {}) =>
  buildMorphRecipe("blink", {
    blend: "morph",
    method: "bend",
    fallback: "fade",
    layers: { "brow-left": { blend: "fade" } },
    keyframes: KEYFRAMES,
    clips: [{ between: ["eyelash-left"], targets: ["eyeball-white-left", "pupil-left"] }],
    ...overrides,
  });

const bake = (overrides: Record<string, unknown> = {}, selection: Record<string, string> = {}, source = FACE) =>
  bakeMorphArtifact({ source, selection, recipes: [recipeOf(overrides)], key: "k", variant: "bunny" });

type El = { tagName: string; attributes: Record<string, string>; children: Node[] };
type Found = { el: El; ancestors: El[] };

const walk = (svg: string): Found[] => {
  const out: Found[] = [];
  const visit = (node: Node, ancestors: El[]) => {
    if (!node || typeof node !== "object") return;
    out.push({ el: node, ancestors });
    for (const child of node.children) visit(child, [...ancestors, node]);
  };
  const doc = parseXml(svg);
  for (const node of Array.isArray(doc) ? doc : [doc]) visit(node, []);
  return out;
};

const RESOURCE = new Set(["defs", "mask", "clipPath", "linearGradient", "radialGradient"]);

const drawnNames = (svg: string): string[] =>
  walk(svg)
    .filter(({ el, ancestors }) => el.tagName === "path" && !ancestors.some((a) => RESOURCE.has(a.tagName)))
    .map(({ el }) => el.attributes["data-name"] ?? "")
    .filter((name, i, all) => name !== all[i - 1]);

const withAttribute = (svg: string, name: string, value?: string): Found[] =>
  walk(svg).filter(({ el }) => (value === undefined ? name in el.attributes : el.attributes[name] === value));

const movedLabels = (artifact: { parts: { svg: string }[] }): string[] =>
  [...new Set(artifact.parts.flatMap((p) => withAttribute(p.svg, "data-morph-motion").map(({ el }) => el.attributes["data-morph-motion"]!)))].sort();

const elementsOf = (el: El): El[] => el.children.filter((c): c is El => !!c && typeof c === "object");

describe("layer motion values", () => {
  test.each<[MorphMotionProperty, unknown]>([
    ["translate", "0 8px"],
    ["translate", "0 -2px"],
    ["translate", 0],
    ["translate", "calc(50% + 2px) 0"],
    ["translate", "25%"],
    ["translate", "none"],
    ["rotate", "5deg"],
    ["rotate", "-0.1turn"],
    ["rotate", 0],
    ["rotate", "calc(2deg * 3)"],
    ["scale", 1.1],
    ["scale", "1.1 0.9"],
    ["scale", "100% 90%"],
    ["transform", "skewX(4deg) matrix(1, 0, 0, 1, 2, 3)"],
    ["transform", "rotate(2deg) translate(1px, 2px)"],
    ["transform", "translateY(-10%) scale(1.05, 0.95) skew(2deg, 0)"],
    ["transform", "none"],
    ["transform_origin", "left top"],
    ["transform_origin", "top left"],
    ["transform_origin", "25% calc(50% + 2px)"],
    ["transform_origin", "center"],
    ["opacity", 0.5],
    ["opacity", "50%"],
  ])("`%s = %s` is a supported 2D value", (property, value) => {
    expect(morphMotionProblem(property, value)).toBeNull();
  });

  test.each<[MorphMotionProperty, unknown, string]>([
    ["translate", 8, "needs `px`"],
    ["translate", "0 8", "needs `px`"],
    ["translate", "0 0 5px", "Only 2D `translate`"],
    ["translate", "0 2em", "lengths in `px`"],
    ["translate", "calc(50% + 2deg) 0", "lengths in `px`"],
    ["translate", "calc(50%+2px) 0", "lengths in `px`"],
    ["rotate", 5, "an angle"],
    ["rotate", "x 30deg", "Only 2D rotation"],
    ["rotate", "1 0 0 30deg", "Only 2D rotation"],
    ["scale", "1 1 2", "Only 2D `scale`"],
    ["scale", "2px", "factors"],
    ["transform", "rotateX(30deg)", "3D transforms are not supported"],
    ["transform", "translate3d(1px, 0, 0)", "3D transforms are not supported"],
    ["transform", "perspective(100px)", "3D transforms are not supported"],
    ["transform", "translate(1px 2px)", "separated by commas"],
    ["transform", "bogus(1)", "is not a 2D transform function"],
    ["transform", "rotate(2deg", "parenthesis left open"],
    ["transform_origin", "left top 5px", "Only a 2D `transform_origin`"],
    ["transform_origin", "top 10px", "horizontal position, then a vertical one"],
    ["transform_origin", "middle", "one or two positions"],
    ["opacity", 2, "between 0 and 1"],
    ["translate", "0 8px !important", "plain ASCII"],
  ])("`%s = %s` is refused", (property, value, message) => {
    expect(morphMotionProblem(property, value)).toContain(message);
  });

  test("CSS text keeps the authored syntax, with opacity as a number", () => {
    expect(morphMotionCss("translate", "0   calc(50% + 2px)")).toBe("0 calc(50% + 2px)");
    expect(morphMotionCss("rotate", 0)).toBe("0");
    expect(morphMotionCss("opacity", "40%")).toBe("0.4");
    expect(morphMotionCss("scale", 1.1)).toBe("1.1");
    expect(morphMotionCss("translate", "0 8")).toBeUndefined();
  });

  test("each property moves between the keyframes that set it, from and to identity where the ends leave it out", () => {
    const motion = buildMorphMotion(KEYFRAMES)!;
    expect(Object.keys(motion)).toEqual(["eyebrows", "nose"]);
    expect(motion["eyebrows"]).toEqual([
      { offset: 0, values: { translate: "0 0" } },
      { offset: 0.333, values: { translate: "0 8px" } },
      { offset: 1, values: { translate: "0 0" } },
    ]);
    expect(motion["nose"]).toEqual([
      { offset: 0, values: { translate: "0px", rotate: "0deg", transform_origin: "50% 50%" } },
      { offset: 0.333, values: { translate: "0 -2px", rotate: "2deg", transform_origin: "left top" } },
      { offset: 1, values: { translate: "0px", rotate: "0deg", transform_origin: "50% 50%" } },
    ]);
    expect(morphMotionKeyframes(motion["nose"]!)[1]).toEqual({ offset: 0.333, translate: "0 -2px", rotate: "2deg", transformOrigin: "left top" });
  });

  test("a property set in the middle only is identity at both ends; one set at an end keeps the other end", () => {
    const motion = buildMorphMotion([
      { eyes: { state: "open" }, nose: { opacity: 0.5 } },
      { eyes: { state: "closed" }, nose: { scale: "1.2" } },
      { eyes: { state: "open" } },
    ])!;
    expect(motion["nose"]).toEqual([
      { offset: 0, values: { scale: "1" } },
      { offset: 0, values: { opacity: "0.5" } },
      { offset: 0.5, values: { scale: "1.2" } },
      { offset: 1, values: { scale: "1", opacity: "1" } },
    ]);
  });

  test("the recipe names the moved labels, not their values, so retuning a distance bakes nothing again", () => {
    const recipe = recipeOf();
    expect(recipe.motion).toEqual(["eyebrows", "nose"]);
    const text = serializeMorphRecipe(recipe);
    const retuned = KEYFRAMES.map((k) => (k.offset === 0.333 ? { ...k, eyebrows: { translate: "0 6px" } } : k));
    expect(serializeMorphRecipe(recipeOf({ keyframes: retuned }))).toBe(text);
    expect(parseMorphRecipe(text)).toEqual(recipe);
    expect(morphMotionLabels([{ nose: { translate: "0 8" } }])).toEqual([]);
    expect(recipeOf({ keyframes: KEYFRAMES.map(({ offset, eyes }) => ({ offset, eyes })) }).motion).toBeUndefined();
  });
});

describe("baking secondary states and layer motion", () => {
  test("a second driven group and moved layers coexist, each moved layer live in its own wrapper in paint order", () => {
    const artifact = bake();
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(Object.keys(artifact.schedules).sort()).toEqual(["brows", "eyes"]);
    expect(artifact.schedules["brows"]!.map((e) => e.state)).toEqual(["up", "down", "up"]);
    expect(Object.keys(artifact.visibility["brows"]!).sort()).toEqual(["down", "up"]);
    expect(movedLabels(artifact)).toEqual(["eyebrows", "nose"]);
    expect(artifact.parts.map((p) => p.kind)).toEqual(["static", "live", "static", "live", "static", "live", "static"]);
    const original = drawnNames(FACE).filter((name) => name !== "brow-left:brows.up-high");
    const composed = artifact.parts.flatMap((p) => drawnNames(p.svg));
    expect(composed).toEqual(original);
    expect(artifact.parts.filter((p) => p.kind === "static").flatMap((p) => drawnNames(p.svg))).toEqual(["face", "cheek", "hair", "chin"]);
  });

  test("a wrapper keeps the moved layer's own transform and paint on its child, with a fill-box centre origin", () => {
    const artifact = bake();
    const browsPart = artifact.parts[3]!.svg;
    const [wrapper] = withAttribute(browsPart, "data-morph-motion", "eyebrows");
    expect(wrapper!.el.attributes["style"]).toBe("transform-box:fill-box;transform-origin:50% 50%");
    const [child] = elementsOf(wrapper!.el);
    expect(elementsOf(wrapper!.el)).toHaveLength(1);
    expect(child!.attributes["data-name"]).toBe("eyebrows");
    expect(child!.attributes["transform"]).toBe("translate(0 2)");
    const ink = withAttribute(browsPart, "data-name", "brow-left:brows.up:default")[0]!.el.attributes["fill"]!;
    expect(ink).toMatch(/^url\(#_m[0-9a-f]+_ink\)$/);
    expect(withAttribute(browsPart, "id", ink.slice(5, -1))[0]?.el.tagName).toBe("linearGradient");
    const [nose] = withAttribute(artifact.parts[5]!.svg, "data-morph-motion", "nose");
    const [drawn] = elementsOf(nose!.el);
    expect(drawn!.attributes["data-name"]).toBe("nose");
    expect(drawn!.attributes["transform"]).toBe("rotate(3 120 110)");
    expect(drawn!.attributes["fill"]).toBe("#a76");
    expect(artifact.rest).not.toContain("data-morph-motion");
  });

  test("a variant whose look chooses the brows down plays the morph and rests them on the morph's rest", () => {
    const artifact = bake({}, { brows: "down" });
    expect(artifact.status).toBe("live");
    expect(artifact.schedules["brows"]!.map((e) => e.state)).toEqual(["up", "down", "up"]);
    expect(drawnNames(artifact.rest)).toContain("brow-left:brows.up:default");
    expect(drawnNames(artifact.rest)).not.toContain("brow-left:brows.down");
  });

  test("a look's own choice the morph does not name gives way to its rest: brows chosen up-high rest up", () => {
    const artifact = bake({}, { brows: "up-high" });
    expect(artifact.status).toBe("live");
    expect(artifact.schedules["brows"]!.map((e) => e.state)).toEqual(["up", "down", "up"]);
    const shown = new Set(artifact.visibility["brows"]!["up"]);
    const part = artifact.parts[3]!.svg;
    const up = withAttribute(part, "data-name", "brow-left:brows.up:default")[0]!.el.attributes["data-morph"]!;
    const down = withAttribute(part, "data-name", "brow-left:brows.down")[0]!.el.attributes["data-morph"]!;
    expect(shown.has(up)).toBe(true);
    expect(shown.has(down)).toBe(false);
    expect(withAttribute(part, "data-name", "brow-left:brows.up-high")).toEqual([]);
  });

  test("a group whose drawing folder lacks a state the morph names makes the whole morph inapplicable, not half of the face", () => {
    const source = FACE.replace('<path data-name="brow-left:brows.down" d="M10,18H90V24H10Z" fill="url(#ink)"/>', "");
    const artifact = bake({}, {}, source);
    expect(artifact.status).toBe("static");
    expect(artifact.diagnostics[0]).toMatchObject({ code: "inactive-variant" });
    expect(artifact.diagnostics[0]!.message).toContain("`brows.down`");
  });

  test("a layer two driven groups both switch is an overlapping claim and keeps the variant still", () => {
    const source = FACE.replace(
      `<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>`,
      `<path data-name="eyelash-left" d="${CLOSED}" fill="#111"/>\n<path data-name="lid:brows.down" d="M0,0H5V5H0Z"/>`,
    );
    const artifact = bake({}, {}, source);
    expect(artifact.status).toBe("static");
    expect(artifact.diagnostics.map((d) => d.code)).toContain("mixed-groups");
  });

  test("a moved label this artwork does not draw moves nothing there, silently, and the rest still plays", () => {
    const keyframes = KEYFRAMES.map((k) => (k.offset === 0.333 ? { ...k, whiskers: { translate: "0 1px" } } : k));
    const artifact = bake({ keyframes });
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics.filter((d) => d.layer === "whiskers")).toEqual([]);
    expect(movedLabels(artifact)).toEqual(["eyebrows", "nose"]);
  });

  test("moving a clip's target or edge is refused for that layer: apertures do not follow layer motion", () => {
    const keyframes = KEYFRAMES.map((k) => (k.offset === 0.333 ? { ...k, "pupil-left": { translate: "0 1px" } } : k));
    const artifact = bake({ keyframes });
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toContainEqual(expect.objectContaining({ code: "motion-ignored", layer: "pupil-left" }));
    expect(movedLabels(artifact)).toEqual(["eyebrows", "nose"]);
  });

  test("nested labels of one moved name move once, from the outermost", () => {
    const source = FACE.replace('<path data-name="hair"', '<g data-name="nose"><path data-name="nose" d="M150,100H160V110H150Z"/></g>\n<path data-name="hair"');
    const artifact = bake({}, {}, source);
    const wrappers = artifact.parts.flatMap((p) => withAttribute(p.svg, "data-morph-motion", "nose"));
    expect(wrappers).toHaveLength(2);
    expect(wrappers.every(({ ancestors }) => !ancestors.some((a) => "data-morph-motion" in a.attributes))).toBe(true);
  });

  test("a moved layer drawn again by reference from outside it holds still, even when both share a live part", () => {
    const keyframes = KEYFRAMES.map((k) => (k.offset === 0.333 ? { ...k, brow: { translate: "0 8px" } } : k));
    const shared = FACE.replace(
      '<path data-name="hair"',
      '<g opacity="0.8"><g id="brow" data-name="brow"><path d="M150,30H170V34H150Z" fill="#321"/></g><use href="#brow" x="30"/></g>\n<path data-name="hair"',
    );
    const artifact = bake({ keyframes }, {}, shared);
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toContainEqual(expect.objectContaining({ code: "motion-ignored", layer: "brow", message: expect.stringContaining('"brow" inside it is drawn again by reference') }));
    expect(movedLabels(artifact)).not.toContain("brow");
    expect(movedLabels(artifact)).toEqual(["eyebrows", "nose"]);
    const clipped = FACE.replace(
      '<path data-name="hair"',
      '<defs><clipPath id="cut"><use href="#nose-art"/></clipPath></defs><g data-name="brow"><path id="nose-art" d="M150,30H170V34H150Z"/></g><path d="M0,0H5V5H0Z" clip-path="url(#cut)"/>\n<path data-name="hair"',
    );
    expect(bake({ keyframes }, {}, clipped).diagnostics).toContainEqual(expect.objectContaining({ code: "motion-ignored", layer: "brow" }));
  });

  test("a gradient defined inside a moved layer and painted elsewhere does not stop the layer moving", () => {
    const keyframes = KEYFRAMES.map((k) => (k.offset === 0.333 ? { ...k, brow: { translate: "0 8px" } } : k));
    const painted = FACE.replace(
      '<path data-name="hair" d="M0,0H200V6H0Z" fill="#432"/>',
      '<g data-name="brow"><linearGradient id="streak"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient><path d="M150,30H170V34H150Z" fill="url(#streak)"/></g>\n<path data-name="hair" d="M0,0H200V6H0Z" fill="url(#streak)"/>',
    );
    const artifact = bake({ keyframes }, {}, painted);
    expect(artifact.diagnostics.filter((d) => d.code === "motion-ignored")).toEqual([]);
    expect(movedLabels(artifact)).toEqual(["brow", "eyebrows", "nose"]);
  });

  test("a layer that shows only where three driven groups meet keeps the variant still, as two groups do", () => {
    const marks = ["a", "b", "c"]
      .map((g, i) => `<path data-name="${g}-mark:${g}.off:default" d="M${i * 10},0H${i * 10 + 5}V5H${i * 10}Z"/><path data-name="${g}-mark:${g}.on" d="M${i * 10},10H${i * 10 + 5}V15H${i * 10}Z"/>`)
      .join("\n");
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
${marks}
<path data-name="combined:a.on:b.on:c.on" d="M0,30H40V35H0Z"/>
</svg>`;
    const pose = (state: string) => ({ a: { state }, b: { state }, c: { state } });
    const recipe = buildMorphRecipe("trio", { blend: "fade", keyframes: [{ offset: 0, ...pose("off") }, { offset: 0.5, ...pose("on") }, { offset: 1, ...pose("off") }] });
    const artifact = bakeMorphArtifact({ source, selection: {}, recipes: [recipe], key: "k3", variant: "trio" });
    expect(artifact.status).toBe("static");
    expect(artifact.diagnostics).toContainEqual(
      expect.objectContaining({ code: "mixed-groups", layer: "combined:a.on:b.on:c.on", message: expect.stringContaining("`a.on` and `b.on` and `c.on` meet") }),
    );
    const plain = source.replace('<path data-name="combined:a.on:b.on:c.on" d="M0,30H40V35H0Z"/>\n', "");
    expect(bakeMorphArtifact({ source: plain, selection: {}, recipes: [recipe], key: "k4", variant: "trio" }).status).toBe("live");
  });
});
