import { describe, expect, test } from "vitest";
import type { Instructions } from "../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";

async function chunksOf(line: string): Promise<{ audio: string[]; image: string[] }> {
  const harness = createHarness(`scene start\n  ${line}\n  done\nend\n`);
  await harness.ready;
  const interpreter = (harness.game.module as any).interpreter;
  const seen = { audio: [] as string[], image: [] as string[] };
  for (const [name, list] of [
    ["createAudioChunk", seen.audio],
    ["createImageChunk", seen.image],
  ] as const) {
    const original = interpreter[name].bind(interpreter);
    interpreter[name] = (content: string) => {
      list.push(content);
      return original(content);
    };
  }
  await harness.preview(0);
  return seen;
}

const LAYOUT = `layout main {
  textbox {
    dialogue {
      text
    }
  }
}
`;

async function dialogueOf(line: string): Promise<string> {
  const harness = createHarness(
    `define nova as character with\n  name = "NOVA"\nend\n\n${LAYOUT}\nscene start\n  NOVA:\n    ${line}\nend\n`,
  );
  await harness.ready;
  harness.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat: Instructions | undefined = harness.nextBeat();
  expect(beat).toBeTruthy();
  return (beat!.text?.["dialogue"] ?? []).map((e: any) => e.text ?? "").join("");
}

describe("literal brackets joined across a hidden comment stay text (I-2426)", () => {
  test.each([
    ["parentheses", "Hello (/* c */(b))", "audio"],
    ["square brackets", "Hello [/* c */[b]]", "image"],
  ] as const)("%s create no directive", async (_label, line, kind) => {
    const seen = await chunksOf(line);
    expect(seen[kind]).toEqual([]);
  });

  test.each([
    ["Hello (/* c */(b))", "Hello ((b))"],
    ["Hello [/* c */[b]]", "Hello [[b]]"],
    ["Hi (there) [you]", "Hi (there) [you]"],
  ])("`%s` shows `%s`", async (line, shown) => {
    expect(await dialogueOf(line)).toBe(shown);
  });

  test.each([
    ["audio", "Hello ((b))", "audio"],
    ["image", "Hello [[b]]", "image"],
  ] as const)("a real %s directive is still read", async (_label, line, kind) => {
    const seen = await chunksOf(line);
    expect(seen[kind]).toEqual(["b"]);
  });
});
