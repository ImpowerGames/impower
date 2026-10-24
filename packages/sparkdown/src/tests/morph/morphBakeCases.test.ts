import { describe, expect, test } from "vitest";
import { filterSVGAttributes } from "../../attributes";
import { bakeMorphArtifact, MORPH_BAKE_SAMPLES } from "../../morph/bake";
import { buildMorphRecipe } from "../../morph/recipe";
import type { MorphArtifact, MorphRecipe } from "../../morph/types";
import { parse } from "../../txml/txml";
import { blink, CLOSED, EYEBALL, layeredPortrait, LOWER_OPEN, PUPIL, UPPER_OPEN } from "./fixtures";

type Element = { tagName: string; attributes: Record<string, string>; children: unknown[] };
const elements = (svg: string): Element[] => {
  const out: Element[] = [];
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (node && typeof node === "object") {
        out.push(node as Element);
        walk((node as Element).children);
      }
    }
  };
  const doc = parse(svg);
  walk(Array.isArray(doc) ? doc : [doc]);
  return out;
};
const area = (flat: number[]) => {
  let sum = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const j = (i + 2) % flat.length;
    sum += flat[i]! * flat[j + 1]! - flat[j]! * flat[i + 1]!;
  }
  return Math.abs(sum) / 2;
};

const URI = "file:///bunny.svg";
const bake = (svg: string, recipe: MorphRecipe, selection: Record<string, string> = {}) =>
  bakeMorphArtifact({ source: svg, selection, recipe, key: "k", variant: "bunny", uri: URI });
const codes = (artifact: MorphArtifact) => artifact.diagnostics.map((d) => d.code);

/** Eye art: whatever `open` and `closed` hold, over a face. */
const art = (open: string, closed: string, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<path data-name="face" d="M0,0H120V100H0Z" fill="#fdb"/>
<g data-name="eyes.open:default">${open}</g>
<g data-name="eyes.closed">${closed}</g>
${extra}
</svg>`;
const lash = (d: string, label = "eyelash-left", attrs = "") => `<path data-name="${label}" d="${d}" fill="#111"${attrs}/>`;
const LASHES_OPEN = lash(UPPER_OPEN) + lash(LOWER_OPEN);
const LASH_CLOSED = lash(CLOSED);

const recipe = (overrides: Record<string, unknown> = {}) =>
  buildMorphRecipe("blink", {
    blend: "morph",
    method: "bend",
    fallback: "fade",
    keyframes: [
      { offset: 0, eyes: { state: "open" } },
      { offset: 0.5, eyes: { state: "closed" } },
      { offset: 1, eyes: { state: "open" } },
    ],
    ...overrides,
  });

describe("morph bake: layered art", () => {
  const layeredRecipe = blink({
    clips: [{ between: ["eyelash-left"], targets: ["eyeball-left", "eyeball-shadow-left"] }],
  });
  const artifact = bake(layeredPortrait(), layeredRecipe);

  test("noncontiguous state layers interleave with the art between them", () => {
    expect(artifact.diagnostics).toEqual([]);
    expect(artifact.parts.map((p) => p.kind)).toEqual(["static", "live", "static", "live", "static"]);
    const names = artifact.parts.map((p) => elements(p.svg).filter((e) => e.tagName === "path" && e.attributes["data-name"]).map((e) => e.attributes["data-name"]));
    expect(names[0]).toEqual(["face"]);
    expect(names[2]).toEqual(["cheeks"]);
    expect(names[4]).toEqual(["hair"]);
  });

  test("each part keeps its ancestors' transforms and carries every resource it uses, transitively", () => {
    const live = elements(artifact.parts[1]!.svg);
    const ids = live.flatMap((e) => (e.attributes["id"] ? [e.attributes["id"]] : []));
    const p = artifact.idPrefix;
    expect(ids).toEqual(expect.arrayContaining([`${p}white`, `${p}white-tint`, `${p}iris-cut`]));
    expect(live.find((e) => e.attributes["id"] === `${p}white-tint`)!.attributes["href"]).toBe(`#${p}white`);
    expect(live.some((e) => e.attributes["transform"] === "translate(30 10)")).toBe(true);
    // The cheeks part references nothing, so it carries nothing.
    expect(elements(artifact.parts[2]!.svg).some((e) => e.attributes["id"])).toBe(false);
  });

  test("a resource only a style sheet references travels with every part that carries the sheet", () => {
    // The face's paint comes from a class rule, not from its own attribute.
    const styled = layeredPortrait()
      .replace("<defs>", "<style>.skin { fill: url(#white); }</style><defs>")
      .replace('<path data-name="face" d="', '<path data-name="face" class="skin" d="')
      .replace(/(<path data-name="face"[^>]*) fill="#fdb"/, "$1");
    const styledArtifact = bake(styled, layeredRecipe);
    expect(styledArtifact.diagnostics).toEqual([]);
    const face = elements(styledArtifact.parts[0]!.svg);
    const p = styledArtifact.idPrefix;
    const sheet = face.find((e) => e.tagName === "style")!;
    expect(sheet.children.join("")).toContain(`url(#${p}white)`);
    expect(face.some((e) => e.tagName === "linearGradient" && e.attributes["id"] === `${p}white`)).toBe(true);
  });

  test("a copied resource keeps what its original ancestors passed down to it", () => {
    // The gradient's stop paints `currentColor`, which its <defs> sets.
    const inherited = layeredPortrait().replace("<defs>", '<defs color="lime">').replace('<stop offset="0" stop-color="#fff"/>', '<stop offset="0" stop-color="currentColor"/>');
    const live = elements(bake(inherited, layeredRecipe).parts[1]!.svg);
    const gradient = live.find((e) => e.tagName === "linearGradient" && e.attributes["id"]?.endsWith("white"))!;
    const holder = live.find((e) => e.tagName === "g" && e.children.includes(gradient));
    expect(holder?.attributes["color"]).toBe("lime");
  });

  test("a target's own clip stays on it inside the aperture's wrapper, so the two intersect", () => {
    const live = elements(artifact.parts[1]!.svg);
    const iris = live.find((e) => e.attributes["data-name"] === "iris")!;
    expect(iris.attributes["clip-path"]).toBe(`url(#${artifact.idPrefix}iris-cut)`);
    const wrapper = live.find((e) => e.tagName === "g" && e.attributes["clip-path"] && (e.children[0] as Element)?.attributes["data-name"] === "eyeball-left");
    expect(wrapper).toBeDefined();
  });

  test("the morphing shadow morphs and is clipped, instead of holding", () => {
    const closing = artifact.segments[0]!;
    const byNode = new Map(elements(artifact.parts[1]!.svg).filter((e) => e.attributes["data-morph"]).map((e) => [e.attributes["data-morph"], e.attributes["data-name"]]));
    const shadow = closing.transitions.filter((t) => t.kind === "morph" && byNode.get(t.from) === "eyeball-shadow-left");
    expect(shadow).toHaveLength(1);
    const wrapped = elements(artifact.parts[1]!.svg).filter((e) => e.tagName === "g" && e.attributes["clip-path"] && (e.children[0] as Element)?.attributes["data-name"] === "eyeball-shadow-left");
    expect(wrapped).toHaveLength(2);
  });

  test("two open lashes on one closed lash share it, and their aperture closes to nothing", () => {
    const closing = artifact.segments[0]!;
    const lashes = closing.transitions.filter((t) => t.kind === "morph" && t.shared);
    expect(lashes).toHaveLength(2);
    expect(new Set(lashes.map((t) => t.kind === "morph" && t.to)).size).toBe(1);
    const loops = artifact.apertures[closing.clips[0]!.loops.index]!;
    expect(area(loops[MORPH_BAKE_SAMPLES - 1]![0]!)).toBeLessThan(1e-3);
  });

  test("the rest render keeps every drawing's paint and adds only the aperture wrappers, mapped into the wrapper's space", () => {
    const rest = elements(artifact.rest);
    const plain = elements(filterSVGAttributes(layeredPortrait(), {}));
    const drawn = (list: Element[]) => list.filter((e) => e.tagName === "path" && e.attributes["data-name"]).map((e) => JSON.stringify(e.attributes));
    expect(drawn(rest)).toEqual(drawn(plain));
    const clip = rest.find((e) => e.tagName === "clipPath" && e.attributes["id"]?.startsWith("morph-clip"))!;
    // The eyeballs sit under translate(30 10) and scale(1); the aperture is
    // computed in root space and mapped back.
    expect((clip.children[0] as Element).attributes["transform"]).toBe("matrix(1 0 0 1 -30 -10)");
  });
});

describe("morph bake: resting states", () => {
  const folders = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100">
<g data-name="left">
<g data-name="eyes.open:default">${LASHES_OPEN}</g>
<g data-name="eyes.closed">${LASH_CLOSED}</g>
</g>
<g data-name="right" transform="translate(120 0)">
<g data-name="eyes.open:default">${lash(UPPER_OPEN, "eyelash-right") + lash(LOWER_OPEN, "eyelash-right")}</g>
<g data-name="eyes.closed">${lash(CLOSED, "eyelash-right")}</g>
</g>
</svg>`;

  test("each folder rests by its own default", () => {
    const artifact = bake(folders, recipe());
    expect(artifact.status).toBe("live");
    expect(artifact.visibility["eyes"]!["open"]).toHaveLength(4);
  });

  test("a refinement of the starting state rests as itself and returns to itself", () => {
    const artifact = bake(art(LASHES_OPEN, LASH_CLOSED), recipe(), { eyes: "open-wide" });
    expect(artifact.status).toBe("live");
    expect(artifact.schedules["eyes"]!.map((k) => k.state)).toEqual(["open-wide", "closed", "open-wide"]);
  });

  test("a variant explicitly resting in another state is left alone", () => {
    const artifact = bake(art(LASHES_OPEN, LASH_CLOSED), recipe(), { eyes: "closed" });
    expect(artifact.status).toBe("static");
    expect(artifact.rest).toBe(filterSVGAttributes(art(LASHES_OPEN, LASH_CLOSED), { eyes: "closed" }));
  });

  test("probing the closed pose does not report what a script selecting it would hear", () => {
    const looking = art(LASHES_OPEN + `<path data-name="pupil:look.left" d="${PUPIL}"/>`, LASH_CLOSED);
    const artifact = bake(looking, recipe(), { look: "left" });
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
  });

  test("variants that differ in art the morph does not drive bake their own parts and the same frames", () => {
    const hats = art(LASHES_OPEN, LASH_CLOSED, `<path data-name="hat.on" d="M0,0H120V10H0Z"/><path data-name="hat.off:default" d="M0,0H1V1H0Z"/>`);
    const bare = bake(hats, recipe());
    const hatted = bake(hats, recipe(), { hat: "on" });
    expect(hatted.parts[hatted.parts.length - 1]!.svg).not.toBe(bare.parts[bare.parts.length - 1]!.svg);
    expect(hatted.frames).toEqual(bare.frames);
  });
});

describe("morph bake: compositing and authored style", () => {
  test("a group a style-sheet rule makes translucent stays whole in one live part", () => {
    const dim = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<style>.dim { opacity: .5 }</style>
<g class="dim">
<path data-name="backing" d="M0,0H120V100H0Z" fill="blue"/>
<g data-name="eyes.open:default">${LASHES_OPEN}</g>
<g data-name="eyes.closed">${LASH_CLOSED}</g>
</g>
</svg>`;
    const artifact = bake(dim, recipe());
    expect(artifact.parts.map((p) => p.kind)).toEqual(["live"]);
    // Without the rule the backing stays static, below the lashes.
    expect(bake(dim.replace(".dim { opacity: .5 }", ".dim { fill: red }"), recipe()).parts.map((p) => p.kind)).toEqual(["static", "live"]);
  });

  test("a live drawing's own inline display goes, so the rest-pose attribute decides", () => {
    const styled = art(LASHES_OPEN, lash(CLOSED, "eyelash-left", ' style="display:inline;fill:#111"'));
    const live = elements(bake(styled, recipe()).parts.find((p) => p.kind === "live")!.svg);
    const closed = live.find((e) => e.attributes["d"] === CLOSED)!;
    expect(closed.attributes["display"]).toBe("none");
    expect(closed.attributes["style"]).toBe("fill:#111");
  });

  test("art the author hid is no live drawing", () => {
    const hidden = art(LASHES_OPEN + `<path data-name="ghost" d="M0,0H5V5H0Z" style="display:none"/>`, LASH_CLOSED);
    const artifact = bake(hidden, recipe());
    expect(artifact.parts.some((p) => p.svg.includes("ghost"))).toBe(false);
  });
});

describe("morph bake: policies", () => {
  const creases = `<path data-name="crease" d="M10,20 C20,10 30,10 40,20 C30,15 20,15 10,20Z" fill="#a75"/>`;

  test("a one-sided crease scales by its layer's fallback and is not reported", () => {
    const artifact = bake(art(LASHES_OPEN + creases, LASH_CLOSED), recipe({ layers: { crease: { fallback: "scale" } } }));
    expect(artifact.diagnostics).toEqual([]);
    const scale = artifact.segments[0]!.transitions.filter((t) => t.kind === "scale");
    expect(scale).toEqual([expect.objectContaining({ direction: "shrink" })]);
    expect(artifact.segments[1]!.transitions.filter((t) => t.kind === "scale")).toEqual([expect.objectContaining({ direction: "grow" })]);
  });

  test("an unpaired drawing fades by default, silently", () => {
    const artifact = bake(art(LASHES_OPEN + creases, LASH_CLOSED), recipe());
    expect(artifact.diagnostics).toEqual([]);
    expect(artifact.segments[0]!.transitions.filter((t) => t.kind === "fade")).toHaveLength(1);
  });

  test("blend = fade crossfades pairs and blend = cut is a flipbook with nothing to report", () => {
    const faded = bake(art(LASHES_OPEN, LASH_CLOSED), recipe({ blend: "fade" }));
    expect(faded.segments[0]!.transitions.every((t) => t.kind === "fade")).toBe(true);
    const flipbook = bake(art(LASHES_OPEN, LASH_CLOSED), recipe({ blend: "cut", method: undefined }));
    expect(flipbook.diagnostics).toEqual([]);
    expect(flipbook.segments[0]!.transitions.every((t) => t.kind === "cut")).toBe(true);
  });

  test("a method that cannot morph a pair reports it on the artwork and uses the fallback", () => {
    const blobs = art(`<path data-name="mark" d="M0,0H10V10H0Z"/>`, `<path data-name="mark" d="M0,0L12,0L12,12L6,16L0,12Z"/>`);
    const artifact = bake(blobs, recipe({ method: "match" }));
    expect(artifact.status).toBe("live");
    // Once, though both the closing and the reopening segment try the pair.
    expect(artifact.diagnostics).toEqual([
      expect.objectContaining({ code: "method-failed", severity: "warning", uri: URI, layer: "mark" }),
    ]);
    expect(artifact.segments[0]!.transitions.map((t) => t.kind)).toEqual(["fade", "fade"]);
  });

  test("a failure served from the shared geometry cache is reported as when it was found", () => {
    const blobs = art(`<path data-name="mark" d="M0,0H10V10H0Z"/>`, `<path data-name="mark" d="M0,0L12,0L12,12L6,16L0,12Z"/>`);
    const geometry = new Map();
    const fresh = bakeMorphArtifact({ source: blobs, selection: {}, recipe: recipe({ method: "match" }), key: "a", uri: URI }, { geometry });
    const cached = bakeMorphArtifact({ source: blobs, selection: { eyes: "open" }, recipe: recipe({ method: "match" }), key: "b", uri: URI }, { geometry });
    expect(geometry.size).toBe(1);
    expect(cached.diagnostics).toEqual(fresh.diagnostics);
  });

  test("compound drawings with different subpath counts fail their method", () => {
    const compound = art(`<path data-name="mark" d="M0,0H10V10H0Z M20,0H30V10H20Z"/>`, `<path data-name="mark" d="M0,0H10V10H0Z"/>`);
    const artifact = bake(compound, recipe({ method: "trace" }));
    expect(artifact.diagnostics[0]).toMatchObject({ code: "method-failed" });
    expect(artifact.diagnostics[0]!.message).toContain("subpath-count");
  });

  test("unequal counts with neither side single do not pair, and warn once for both directions", () => {
    const counts = art(lash(UPPER_OPEN, "mark") + lash(LOWER_OPEN, "mark"), lash(CLOSED, "mark") + lash(UPPER_OPEN, "mark") + lash(LOWER_OPEN, "mark", ` transform="translate(0 5)"`));
    expect(codes(bake(counts, recipe())).filter((c) => c === "pairing-count")).toHaveLength(1);
  });

  test("a pair with no method is reported once per pair, though both directions try it", () => {
    // Two pairs (upper and lower lash onto the closed one), each tried
    // closing and again reopening.
    const artifact = bake(art(LASHES_OPEN, LASH_CLOSED), recipe({ method: undefined }));
    expect(codes(artifact).filter((c) => c === "missing-method")).toHaveLength(2);
  });
});

describe("morph bake: apertures that cannot be built", () => {
  const clip = (between: string[], targets: string[]) => recipe({ clips: [{ between, targets }] });
  const ball = `<path data-name="eyeball" d="${EYEBALL}" fill="#fff"/>`;

  test("an edge label no drawing carries disables the morph", () => {
    const artifact = bake(art(ball + LASHES_OPEN, LASH_CLOSED), clip(["eyelash-right"], ["eyeball"]));
    expect(artifact.status).toBe("static");
    expect(codes(artifact)).toContain("edge-missing");
  });

  test("a clip missing one of its edges is refused even when the others make an aperture", () => {
    const artifact = bake(art(ball + LASHES_OPEN, LASH_CLOSED), clip(["eyelash-left", "missing-edge"], ["eyeball"]));
    expect(artifact.status).toBe("static");
    expect(artifact.diagnostics).toEqual([expect.objectContaining({ code: "edge-missing", layer: "missing-edge", uri: URI })]);
  });

  test("every sample of an aperture has the same points, the closed one included", () => {
    const artifact = bake(art(ball + LASHES_OPEN, LASH_CLOSED), clip(["eyelash-left"], ["eyeball"]));
    const table = artifact.apertures[0]!;
    expect(new Set(table.map((sample) => sample.map((loop) => loop.length).join("+"))).size).toBe(1);
    expect(area(table[table.length - 1]![0]!)).toBeLessThan(1e-3);
  });

  test("three edges meeting at the same tips are ambiguous", () => {
    const middle = lash("M0,50 C30,40 70,40 100,50 C70,45 30,45 0,50Z");
    const artifact = bake(art(ball + LASHES_OPEN + middle, LASH_CLOSED), clip(["eyelash-left"], ["eyeball"]));
    expect(artifact.status).toBe("static");
    expect(codes(artifact)).toContain("aperture-ambiguous");
  });

  test("a target that contains its own edges is refused", () => {
    const wrapped = art(`<g data-name="eye">${ball + LASHES_OPEN}</g>`, `<g data-name="eye">${LASH_CLOSED}</g>`);
    const artifact = bake(wrapped, clip(["eyelash-left"], ["eye"]));
    expect(artifact.status).toBe("static");
    expect(codes(artifact)).toEqual(["clip-self-dependent"]);
  });

  test("an edge that does not morph with bend cannot bound an aperture", () => {
    const fading = recipe({
      clips: [{ between: ["eyelash-left"], targets: ["eyeball"] }],
      layers: { "eyelash-left": { blend: "fade" } },
    });
    const artifact = bake(art(ball + LASHES_OPEN, LASH_CLOSED), fading);
    expect(artifact.status).toBe("static");
    expect(codes(artifact)).toContain("edge-not-bend");
  });

  test("a missing referenced resource is reported on the artwork", () => {
    const artifact = bake(art(lash(UPPER_OPEN, "eyelash-left", ` stroke="url(#gone)"`) + lash(LOWER_OPEN), LASH_CLOSED), recipe());
    expect(artifact.diagnostics).toEqual([expect.objectContaining({ code: "resource-missing", uri: URI })]);
  });
});
