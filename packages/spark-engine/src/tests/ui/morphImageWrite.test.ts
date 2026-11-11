import { describe, expect, test } from "vitest";
import { blinkScript, talkingPortrait, talkScript } from "@impower/sparkdown/src/tests/morph/fixtures";
import { createHarness } from "./harness/uiTestHarness";

const ART = {
  uri: "inmemory:///bunny.svg",
  type: "image",
  name: "bunny",
  ext: "svg",
  data: talkingPortrait(),
} as any;

const scene = (morphs: string) => `${morphs}


scene start
  HERO:
    [[show portrait bunny]]
    Line.
end
`;

async function written(source: string) {
  const harness = createHarness(source, 0, { assets: [ART] });
  const logged: [string, string][] = [];
  (harness.game as any)._context.system.log = (message: unknown, severity: string) => logged.push([String(message), severity]);
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((line) => line.includes("Line.")));
  const writes = harness.messages
    .flatMap((message) => (message?.method === "ui/batch" ? message.params.messages : [message]))
    .filter((message) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length);
  const content = writes.at(-1)?.params.instructions[0].content;
  return { content, warnings: logged.filter(([, severity]) => severity === "warning").map(([message]) => message) };
}

describe("the image write for morphs on one portrait", () => {
  test("two morphs on different groups write one play each, on one shared reference, without a warning", async () => {
    const { content, warnings } = await written(scene(`${blinkScript()}\n${talkScript()}`));
    const plays = content.morph.plays;
    expect(plays.map((p: any) => p.morph)).toEqual(["blink", "talk"]);
    expect(plays.map((p: any) => p.layer)).toEqual([0, 0]);
    expect(plays[0].ref).toEqual(plays[1].ref);
    expect(plays[0].ref).toMatchObject({ morphs: ["blink", "talk"], image: "bunny", groups: ["eyes", "mouth"] });
    expect(plays[0].definition).not.toBe(plays[1].definition);
    expect(warnings).toEqual([]);
  });

  test("two morphs that overlap write no play, and the warning names them and what they share", async () => {
    const overlapping = talkScript().replace("        teeth\n", "        teeth\n        pupil-left\n");
    const { content, warnings } = await written(scene(`${blinkScript()}\n${overlapping}`));
    expect(content.morph).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("`bunny` stays still");
    expect(warnings[0]).toContain("`blink`, `talk` share clip label `pupil-left`");
  });
});
