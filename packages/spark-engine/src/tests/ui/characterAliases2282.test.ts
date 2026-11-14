import { describe, expect, test } from "vitest";
import type { Instructions } from "../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define raffles as character with
  name = "RAFFLES"
  aliases = { "STRANGER", "STRANGER?", "???" }
end

define bunny as character with
  name = "BUNNY"
  aliases = { "???" }
end

define raffles as synth with
  pitch = {
    frequency = 340
  }
end

layout main {
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
  }
}
`;

async function beatsOf(body: string, count = 1): Promise<Instructions[]> {
  const h = createHarness(`${DEFS}\n\nscene start\n${body}end\n`);
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beats: Instructions[] = [];
  for (let n = 0; n < count; n += 1) {
    const beat = h.nextBeat();
    expect(beat).toBeTruthy();
    beats.push(beat!);
  }
  return beats;
}

const beatText = (beat: Instructions, target: string): string =>
  (beat.text?.[target] ?? []).map((e: any) => e.text ?? "").join("");

const synthNames = (beat: Instructions): string[] =>
  (beat.audio?.["typewriter"] ?? []).map((event) => event.assets![0]!.split("~")[0]!);

describe("a cue that is one of a character's aliases (#2282)", () => {
  test("names the alias's owner while the name box and the speaker show the cue as written", async () => {
    const [beat] = await beatsOf(`  STRANGER?:\n    Bunny--?\n`);
    expect(beat!.speaker).toEqual({ name: "STRANGER?", parenthetical: "", character: "raffles" });
    expect(beatText(beat!, "character_name")).toBe("STRANGER?");
    expect(beatText(beat!, "dialogue")).toBe("Bunny--?");
  });

  test("its speech carries the owner and its voice beeps use the owner's synth", async () => {
    const [beat] = await beatsOf(`  STRANGER:\n    Hello there, my good friend\n`);
    expect(beat!.speech?.character).toBe("raffles");
    expect(synthNames(beat!)).toEqual(["raffles"]);
  });

  test("a parenthetical and a position on the cue do not change the match", async () => {
    const [beat] = await beatsOf(`  STRANGER? (O.S.) [<]:\n    Bunny--?\n`);
    expect(beat!.speaker).toEqual({ name: "STRANGER?", parenthetical: "(O.S.)", character: "raffles" });
    expect(beat!.speech?.character).toBe("raffles");
  });

  test("a line that continues the box keeps the character", async () => {
    const [, second] = await beatsOf(`  STRANGER?: Bunny--? .. >\n  .. Is that you?\n`, 2);
    expect(second!.speaker).toEqual({ name: "STRANGER?", parenthetical: "", character: "raffles" });
    expect(beatText(second!, "character_name")).toBe("STRANGER?");
    expect(beatText(second!, "dialogue")).toBe("Bunny--? Is that you?");
    expect(second!.speech?.character).toBe("raffles");
  });

  test("an alias of two characters names nobody", async () => {
    const [beat] = await beatsOf(`  ???:\n    You don't remember me?\n`);
    expect(beat!.speaker).toEqual({ name: "???", parenthetical: "" });
    expect(beat!.speech).toBeUndefined();
    expect(synthNames(beat!)).not.toContain("raffles");
  });

  test("an alias every character inherits from the character define is a unique alias of the one character that inherits it", async () => {
    const h = createHarness(
      `define character with\n  aliases = { "MASK" }\nend\n\ndefine raffles as character with\n  name = "RAFFLES"\nend\n\n\nscene start\n  MASK:\n    Hello.\nend\n`,
    );
    await h.ready;
    h.jumpToFlow("start");
    await flushMicrotasks(10);
    const beat = h.nextBeat();
    expect(beat?.speaker).toEqual({ name: "MASK", parenthetical: "", character: "raffles" });
  });

  test.each(["constructor", "toString"])("an alias named like an object property, `%s`, names its character", async (alias) => {
    const h = createHarness(
      `define raffles as character with\n  name = "RAFFLES"\n  aliases = { "${alias}" }\nend\n\n\nscene start\n  ${alias}:\n    Hello.\nend\n`,
    );
    await h.ready;
    h.jumpToFlow("start");
    await flushMicrotasks(10);
    const beat = h.nextBeat();
    expect(beat?.speaker).toEqual({ name: alias, parenthetical: "", character: "raffles" });
  });

  test("a cue written as the define name or the `name` shows the `name` as before", async () => {
    const [byName, byDefine] = await beatsOf(`  RAFFLES:\n    Hello.\n  raffles:\n    Hello.\n`, 2);
    expect(byName!.speaker).toEqual({ name: "RAFFLES", parenthetical: "", character: "raffles" });
    expect(byDefine!.speaker).toEqual({ name: "RAFFLES", parenthetical: "", character: "raffles" });
    expect(beatText(byDefine!, "character_name")).toBe("RAFFLES");
  });
});
