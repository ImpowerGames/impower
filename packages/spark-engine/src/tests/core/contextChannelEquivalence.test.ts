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
      if (!lspType) continue;
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
    const h = createHarness(SOURCE);
    await h.ready;
    const runtime = buildDefinesContext((h.game as any).story);
    const narrator: any = runtime["typewriter"]?.["narrator"];
    expect(narrator).toBeDefined();
    expect(narrator.letter_pause).toBe(0.05);
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
