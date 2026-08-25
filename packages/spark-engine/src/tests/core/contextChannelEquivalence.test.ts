// The CHANNEL CONTRACT between the two define contexts (#370):
//
//   - The LSP channel (`program.context`) may carry editor `$`-metadata
//     (`$link`, `$recursive`, `$schema`, …) — reference resolution and
//     validation read it there. The RUNTIME channel (`buildDefinesContext`,
//     what the Game's modules see) carries only `$type`/`$name`.
//   - For every define type and name both channels emit, the runtime struct
//     is a SUPERSET of the LSP one: every prop the LSP view carries is
//     present runtime-side WITH THE SAME VALUE. A shared key resolving to
//     different values on the two channels is the #344 class of bug — a
//     warm-up or validator computing a different answer than the renderer
//     from "the same" struct — and is what this suite exists to catch.
//   - Superset, not equality, is deliberate: the runtime channel resolves
//     the FULL inheritance chain — type-root defaults, a user subtype's
//     `store` props (`companion.trust` reaching `O`), and the union a
//     prelude-dual-defined name produces (`typewriter` is a root type AND a
//     synth instance, which is what lets a typewriter def carry its voice's
//     synth payload; see `isSynth`) — while the LSP view stays close to the
//     per-declaration source, which is what hover/validation want.

import { describe, expect, test } from "vitest";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";
import { compileUI, createHarness } from "../ui/harness/uiTestHarness";

const SOURCE = `define pan_right as animation with
  keyframes = {
    background_position = "right"
  }
end

define companion as character with
  store trust = 0
end

define O as companion with
  name = "Orion"
end

define raffles as synth with
  pitch = {
    frequency = 340
  }
end

define narrator as typewriter with
  letter_pause = 0.05
end

-> start
scene start
  Hello.
end
`;

/** Drop `$`-prefixed keys except `$type`/`$name` (struct top level only, so
 *  nested reference values keep their identity keys). */
const stripEditorMeta = (struct: any): any => {
  if (!struct || typeof struct !== "object" || Array.isArray(struct)) {
    return struct;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(struct)) {
    if (k.startsWith("$") && k !== "$type" && k !== "$name") continue;
    out[k] = v;
  }
  return out;
};

describe("LSP and runtime define channels agree (the channel contract)", () => {
  test("every runtime struct is a superset of its LSP counterpart, same values", async () => {
    const { program } = compileUI(SOURCE);
    const h = createHarness(SOURCE);
    await h.ready;
    const runtime = buildDefinesContext((h.game as any).story);
    const lsp: any = program.context ?? {};

    const compared: string[] = [];
    for (const [type, structs] of Object.entries(runtime)) {
      const lspType = lsp[type];
      if (!lspType) continue; // runtime-only view of a nested type namespace
      for (const [name, runtimeStruct] of Object.entries(
        structs as Record<string, any>,
      )) {
        const lspStruct = lspType[name];
        if (lspStruct === undefined) continue;
        if (typeof lspStruct !== "object" || lspStruct === null) continue;
        compared.push(`${type}.${name}`);
        expect(runtimeStruct, `${type}.${name}`).toMatchObject(
          stripEditorMeta(lspStruct),
        );
      }
    }
    // The sweep must actually have covered the authored defines — an empty
    // loop would make this test pass vacuously. (It also sweeps every
    // builtin the prelude registers, several hundred structs.)
    // (`O` appears under `companion` only: registering an instance under
    // every ANCESTOR type is a runtime-channel behavior; the LSP registers
    // it under its declared type.)
    for (const expected of [
      "animation.pan_right",
      "companion.O",
      "synth.raffles",
      "typewriter.narrator",
    ]) {
      expect(compared, `${expected} was compared`).toContain(expected);
    }
    expect(compared.length).toBeGreaterThan(100);
  });

  test("an authored typewriter carries its type root's pacing props", async () => {
    // The regression the superset sweep first caught: `typewriter`'s flat
    // global resolves to one of its prelude dual-definitions, so an authored
    // `as typewriter` chained through the WRONG parent and lost the root's
    // pacing props — the interpreter's inline fallbacks (1s and 0s) took
    // over, collapsing pause scales 5-16x for lookup HITS (the earlier
    // `$default` fallback fix only covered misses). `buildDefinesContext`
    // now deep-fills instances from the emitted `$default`s.
    const h = createHarness(SOURCE);
    await h.ready;
    const runtime = buildDefinesContext((h.game as any).story);
    const narrator: any = runtime["typewriter"]?.["narrator"];
    expect(narrator).toBeDefined();
    expect(narrator.letter_pause).toBe(0.05); // authored wins
    expect(narrator.phrase_pause_scale).toBe(5);
    expect(narrator.em_dash_pause_scale).toBe(16);
    expect(narrator.min_syllable_length).toBe(3);
  });

  test("the runtime channel carries no editor metadata", async () => {
    const h = createHarness(SOURCE);
    await h.ready;
    const runtime = buildDefinesContext((h.game as any).story);
    const offenders: string[] = [];
    for (const [type, structs] of Object.entries(runtime)) {
      for (const [name, struct] of Object.entries(
        structs as Record<string, any>,
      )) {
        for (const key of Object.keys(struct ?? {})) {
          if (key.startsWith("$") && key !== "$type" && key !== "$name") {
            offenders.push(`${type}.${name}.${key}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
