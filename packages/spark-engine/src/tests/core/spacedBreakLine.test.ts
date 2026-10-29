import { describe, expect, test } from "vitest";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

const SOURCE = `define BG as image with
  src = "https://example.com/bg.png"
end

-> start

scene start
  HERO: [[show backdrop BG]] One. > Two. > Three.
  HERO: A > > B
  HERO: Before > -> later
end

scene later
  HERO: Later.
  Next.
end
`;

const lineOf = (needle: string): number =>
  SOURCE.split("\n").findIndex((l) => l.includes(needle));
const THREE = lineOf("One. > Two. > Three.");
const EMPTY_MIDDLE = lineOf("A > > B");

const writtenText = (harness: any): string =>
  harness
    .snapshotFiltered("ui/write-text")
    .map((m: any) =>
      (m?.params?.instructions ?? []).map((i: any) => i.text ?? "").join(""),
    )
    .join(" ");

const body = (beat: any): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => !target.startsWith("character_"))
    .flatMap(([, events]) => events as any[])
    .map((e: any) => e.text ?? "")
    .join("");

async function scrubTo(line: number) {
  const simulator = createHarness(SOURCE, line, { connect: false });
  const simulated: any = simulator.game;
  simulated.setStartFrom({ file: MAIN_URI, line }, "last");
  simulated.simulate();
  expect(simulated.simulation).toBe("success");
  const checkpoint = simulated.save();

  const player = createHarness(SOURCE, line, { loadCheckpoint: checkpoint });
  await player.ready;
  const backdrop = (): string[] =>
    flatten(player.messages)
      .filter(
        (m: any) =>
          m?.method === "ui/write-image" && m.params?.target === "backdrop",
      )
      .map((m: any) => JSON.stringify(m.params.instructions));
  const restored = backdrop();
  player.reset();
  await player.preview(line);
  return { text: writtenText(player), backdrop: [...restored, ...backdrop()] };
}

const flatten = (messages: any[]): any[] =>
  messages.flatMap((m: any) =>
    m?.method === "ui/batch" ? flatten(m.params?.messages ?? []) : [m],
  );

async function playFrom(line: number, count: number) {
  const harness = createHarness(SOURCE, line);
  await harness.ready;
  harness.game.setStartFrom({ file: MAIN_URI, line });
  const startAddress = harness.game.startAddress;
  expect(startAddress).toBeTruthy();
  harness.jumpTo(startAddress!);
  const beats: string[] = [];
  for (let i = 0; i < count; i++) beats.push(body(harness.nextBeat()));
  return beats;
}

describe("a line that `>` breaks", () => {
  test("holds its beats on the same line, the first for PLAY and the last for the preview", () => {
    const { game } = createHarness(SOURCE, THREE, { connect: false });
    const locator = programLocator(game.program);
    const at = (beat: "first" | "last") =>
      locator.addressAt(MAIN_URI, THREE, { beat });
    const first = at("first");
    const last = at("last");
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(last).not.toBe(first);
    expect(locator.locationOf(first)?.startLine).toBe(THREE);
    expect(locator.locationOf(last)?.startLine).toBe(THREE);
  });

  test("the preview of the line shows its last beat, with what the earlier beats did", async () => {
    const { text, backdrop } = await scrubTo(THREE);
    expect(text).toContain("Three.");
    expect(text).not.toContain("One.");
    expect(text).not.toContain("Two.");
    expect(backdrop.some((write) => write.includes("bg.png"))).toBe(true);
  });

  test("PLAY from the line starts at its first beat", async () => {
    expect(await playFrom(THREE, 3)).toEqual(["One.", "Two.", "Three."]);
  });

  test("an empty beat between two breaks sorts after the beat before it", async () => {
    expect(await playFrom(EMPTY_MIDDLE, 3)).toEqual(["A", "", "B"]);
  });

  test("a break before a divert keeps the line's own beat first", async () => {
    const line = lineOf("Before > -> later");
    const { game } = createHarness(SOURCE, line, { connect: false });
    const locator = programLocator(game.program);
    const at = (beat: "first" | "last") =>
      locator.addressAt(MAIN_URI, line, { beat });
    expect(at("first")).not.toBe(at("last"));
    expect(await playFrom(line, 2)).toEqual(["Before", "Later."]);
  });
});
