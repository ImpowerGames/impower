import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseMorphAssetRequest } from "../../morph/assetService";
import { bakeMorphArtifact, type MorphGeometryCache, type MorphGeometryEntry } from "../../morph/bake";
import { createMorphHost, inlineMorphSource } from "../../morph/hosts";
import { morphOverlaps, serializeMorphRecipe } from "../../morph/recipe";
import { morphPosesAt } from "../../morph/render";
import { MorphBakeService } from "../../morph/service";
import type { MorphArtifact } from "../../morph/types";
import { blink, blinkScript, talk, talkingPortrait, talkScript } from "./fixtures";

const URI = "file:///main.sd";

function compile(text: string, options: { svg?: string; served?: boolean } = {}) {
  const svg = options.svg ?? talkingPortrait();
  const compiler = new SparkdownCompiler();
  compiler.configure({
    ...(options.served ? { stripImageData: true } : {}),
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      {
        uri: "file:///bunny.svg",
        type: "image",
        name: "bunny",
        ext: "svg",
        ...(options.served ? { src: "/file:/local/bunny.svg?v=7-100", text: svg } : { data: svg }),
      },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

const SCRIPT = `${blinkScript()}
${talkScript()}
[[bunny]]
`;

const MOVE_NOSE = "      nose {\n        translate = 0 -2px\n      }\n";
const movingNose = (script: string, state: string) => script.replace(`        state = ${state}\n      }\n`, `        state = ${state}\n      }\n${MOVE_NOSE}`);

async function bakeRef(text: string, svg?: string): Promise<MorphArtifact> {
  const program = compile(text, svg ? { svg } : {});
  const host = createMorphHost({
    service: new MorphBakeService(),
    channel: () => program.morphs,
    readSource: inlineMorphSource(() => program.context),
  });
  const refs = program.morphs!.variants["bunny"]!;
  expect(refs).toHaveLength(1);
  const handle = await host.resolve(refs[0]!);
  const artifact = handle.artifact;
  handle.release();
  return artifact;
}

const bakeSet = (svg = talkingPortrait(), options?: { geometry?: MorphGeometryCache }) =>
  bakeMorphArtifact({ source: svg, selection: {}, recipes: [blink(), talk()], key: "set", variant: "bunny", uri: "file:///bunny.svg" }, options);

describe("morphs that drive different groups play together", () => {
  test("a variant two non-overlapping morphs play on gets one reference covering both", () => {
    const refs = compile(SCRIPT).morphs!.variants["bunny"]!;
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ morphs: ["blink", "talk"], image: "bunny", groups: ["eyes", "mouth"] });
  });

  test("the served route carries every recipe of the set, and the asset service reads the set back", () => {
    const program = compile(SCRIPT, { served: true });
    const ref = program.morphs!.variants["bunny"]![0]!;
    const params = new URL(ref.src!, "https://host.invalid").searchParams;
    expect(params.getAll("morph")).toEqual([program.morphs!.recipes["blink"], program.morphs!.recipes["talk"]]);
    expect(params.get("key")).toBe(ref.key);
    const request = parseMorphAssetRequest(params);
    expect(request !== "invalid" && request?.recipes.map((r) => r.name)).toEqual(["blink", "talk"]);
  });

  test("the key covers the set: changing either morph's recipe changes it, retiming either does not", () => {
    const key = (text: string) => compile(text).morphs!.variants["bunny"]![0]!.key;
    const base = key(SCRIPT);
    expect(key(`${blinkScript("  fallback = cut\n")}\n${talkScript()}\n[[bunny]]\n`)).not.toBe(base);
    expect(key(`${blinkScript()}\n${talkScript("  fallback = cut\n")}\n[[bunny]]\n`)).not.toBe(base);
    expect(key(`${blinkScript()}\n${talkScript("  timing {\n    duration = 2\n  }\n")}\n[[bunny]]\n`)).toBe(base);
  });

  test("one live artifact drives each group from its own morph's keyframes", async () => {
    const artifact = await bakeRef(SCRIPT);
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(artifact.morphs).toEqual(["blink", "talk"]);
    expect(artifact.groups).toEqual({ eyes: "blink", mouth: "talk" });
    const schedule = (group: string) => artifact.schedules[group]!.map(({ offset, state }) => [Math.round(offset * 1e5) / 1e5, state]);
    expect(schedule("eyes")).toEqual([[0, "open"], [0.33333, "closed"], [1, "open"]]);
    expect(schedule("mouth")).toEqual([[0, "open"], [0.5, "closed"], [1, "open"]]);
    const eyes = artifact.segments.flatMap((s, i) => (s.group === "eyes" ? [i] : []));
    const mouth = artifact.segments.flatMap((s, i) => (s.group === "mouth" ? [i] : []));
    expect(eyes).toHaveLength(2);
    expect(mouth).toHaveLength(2);
    const closing = artifact.schedules["eyes"]![1]!.offset;
    const poses = morphPosesAt(artifact, { blink: closing / 2, talk: 0.75 });
    expect(poses["eyes"]).toMatchObject({ segment: eyes[0] });
    expect((poses["eyes"] as { progress: number }).progress).toBeCloseTo(0.5, 9);
    expect(poses["mouth"]).toEqual({ segment: mouth[1], progress: 0.5 });
    const resting = morphPosesAt(artifact, { blink: 0.2 });
    expect(Object.keys(resting)).toEqual(["eyes"]);
  });

  test("the rest render carries both morphs' clips", () => {
    const artifact = bakeSet();
    expect(artifact.status).toBe("live");
    expect([...new Set(artifact.clipTargets.map((t) => t.clip))]).toEqual([0, 1]);
    for (const { aperture } of artifact.clipTargets) {
      const id = aperture.slice(artifact.idPrefix.length);
      expect(artifact.rest).toContain(`<mask id='${id}'`);
      expect(artifact.rest).toContain(`<g mask='url(#${id})'><path data-name='`);
    }
    const masked = (label: string) => artifact.clipTargets.some(({ aperture }) => artifact.rest.includes(`<g mask='url(#${aperture.slice(artifact.idPrefix.length)})'><path data-name='${label}'`));
    expect(masked("eyeball-white-left")).toBe(true);
    expect(masked("teeth")).toBe(true);
  });

  test("a set that shares a morph with an earlier bake searches no pair again", () => {
    const counting = (): MorphGeometryCache & { pairs: number } => {
      const map = new Map<string, MorphGeometryEntry>();
      const cache = {
        pairs: 0,
        get: (key: string) => map.get(key),
        set: (key: string, value: MorphGeometryEntry) => {
          if (key.startsWith("pair:")) cache.pairs += 1;
          map.set(key, value);
        },
      };
      return cache;
    };
    const one = (recipes: ReturnType<typeof blink>[], geometry: MorphGeometryCache) =>
      bakeMorphArtifact({ source: talkingPortrait(), selection: {}, recipes, key: "k", variant: "bunny" }, { geometry });
    const talkAlone = counting();
    const talking = one([talk()], talkAlone);
    const shared = counting();
    const blinking = one([blink()], shared);
    const afterBlink = shared.pairs;
    const both = one([blink(), talk()], shared);
    const fresh = counting();
    const unshared = one([blink(), talk()], fresh);
    expect([talking, blinking, both, unshared].map((artifact) => artifact.status)).toEqual(["live", "live", "live", "live"]);
    expect(talkAlone.pairs).toBeGreaterThan(0);
    expect(afterBlink).toBeGreaterThan(0);
    expect(fresh.pairs).toBe(afterBlink + talkAlone.pairs);
    expect(shared.pairs - afterBlink).toBe(talkAlone.pairs);
  });

  test("a layer conditioned on both morphs' groups keeps the portrait still, with the error naming both morphs", () => {
    const svg = talkingPortrait({
      mouth: '<g data-name="squint:eyes.closed"><path data-name="crease" d="M140,20H160V30H140Z" fill="#000"/></g><g data-name="squint:eyes.open"><path data-name="crease" d="M140,22H160V28H140Z" fill="#000"/></g>',
    });
    const artifact = bakeSet(svg);
    expect(artifact.status).toBe("static");
    const mixed = artifact.diagnostics.filter((d) => d.code === "mixed-groups");
    expect(mixed).toHaveLength(1);
    expect(mixed[0]).toMatchObject({ severity: "error", morphs: ["blink", "talk"] });
    expect(mixed[0]!.message).toContain("the morphs drive");
  });

  test("a bake diagnostic names the morph it concerns, and an artwork-wide one names the set", () => {
    const missing = bakeMorphArtifact({
      source: talkingPortrait(),
      selection: {},
      recipes: [blink(), talk({ clips: [{ between: ["lip"], targets: ["teeth", "tongue"] }] })],
      key: "k",
      variant: "bunny",
    });
    expect(missing.status).toBe("live");
    expect(missing.diagnostics.filter((d) => d.code === "target-missing")).toEqual([
      expect.objectContaining({ morphs: ["talk"], layer: "tongue", message: expect.stringContaining("Clip 1 targets `tongue`") }),
    ]);
    const styled = bakeSet(talkingPortrait().replace("<defs>", "<defs><style>path{fill:red}</style>"));
    expect(styled.status).toBe("static");
    expect(styled.diagnostics).toEqual([expect.objectContaining({ code: "unsupported-element", morphs: ["blink", "talk"] })]);
  });
});

describe("morphs that overlap keep the image still", () => {
  const cases: [string, string, string[], string[], string[]][] = [
    ["drive the same group", `${blinkScript()}\n${blinkScript().replace("morph blink", "morph squint")}\n[[bunny]]\n`, ["eyes"], [], ["eyeball-white-left", "eyelash-left", "pupil-left"]],
    ["move the same label", `${movingNose(blinkScript(), "closed")}\n${movingNose(talkScript(), "open")}\n[[bunny]]\n`, [], ["nose"], []],
    ["name the same clip label", `${blinkScript()}\n${talkScript().replace("        teeth\n", "        teeth\n        pupil-left\n")}\n[[bunny]]\n`, [], [], ["pupil-left"]],
  ];
  for (const [what, text, groups, moved, clips] of cases) {
    test(`two morphs that ${what} get a reference each, and the overlap names what they share`, () => {
      const program = compile(text);
      const refs = program.morphs!.variants["bunny"]!;
      expect(refs.map((r) => r.morphs)).toHaveLength(2);
      expect(refs.every((r) => r.morphs.length === 1)).toBe(true);
      const recipes = Object.values(program.morphs!.recipes).map((r) => JSON.parse(r));
      expect(morphOverlaps(recipes)).toEqual([{ morphs: expect.any(Array), groups, moved, clips }]);
    });
  }

  test("the asset service refuses a set out of order or whose morphs overlap", () => {
    const params = (...recipes: string[]) => {
      const search = new URLSearchParams({ attributes: "{}", key: "k" });
      for (const recipe of recipes) search.append("morph", recipe);
      return search;
    };
    const [b, t] = [serializeMorphRecipe(blink()), serializeMorphRecipe(talk())];
    expect(parseMorphAssetRequest(params(b, t))).not.toBe("invalid");
    expect(parseMorphAssetRequest(params(t, b))).toBe("invalid");
    expect(parseMorphAssetRequest(params(b, b))).toBe("invalid");
    expect(parseMorphAssetRequest(params(b, serializeMorphRecipe({ ...blink(), name: "squint" })))).toBe("invalid");
  });
});
