import { describe, expect, it } from "vitest";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "inmemory:///bg.png", type: "image", name: "bg", ext: "png", src: "/file:/proj/bg.png?v=1" },
  { uri: "inmemory:///bunny.png", type: "image", name: "bunny", ext: "png", src: "/file:/proj/bunny.png?v=1" },
];

type Harness = ReturnType<typeof createHarness>;

async function played(line: string, setup = "[[show backdrop bg]]\n  [[show portrait bunny]]") {
  const target = line.split(" ")[1]!;
  const h: Harness = createHarness(`scene start\n  ${setup}\n  One.\n  [[${line}]]\n  Two.\nend\n`, 0, {
    assets: ASSETS,
  });
  await h.ready;
  h.jumpToFlow("start");
  const first = h.nextBeat()!;
  await h.display(first, false);
  await flushMicrotasks();
  const beat = h.nextBeat()!;
  const mark = h.messages.length;
  await h.display(beat, false);
  await flushMicrotasks();
  const write = h.messages
    .slice(mark)
    .filter((m: any) => m?.method === "ui/write-image" && m.params?.target === target)
    .at(-1)?.params;
  const parsed = h.game.module.interpreter.parse(`[[${line}]] Hello`, "main", {} as any).text ?? {};
  const firstLetter = Object.values(parsed).flat()[0] as { after?: number } | undefined;
  return { beat, held: firstLetter?.after ?? 0, instruction: write?.instructions.at(-1) };
}

const timing = (animation: any) => ({
  name: animation.$name,
  delay: animation.timing.delay,
  duration: animation.timing.duration,
  easing: animation.timing.easing,
  iterations: animation.timing.iterations,
});

describe("every `with` on an `animate` line plays, each with its own timing (I-2853)", () => {
  it("two `with` clauses send two animations for the layer with their own timings", async () => {
    const { instruction } = await played("animate portrait with shake over 1s with spin over 5s ease linear");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", delay: "0s", duration: "1s" }),
      expect.objectContaining({ name: "spin", delay: "0s", duration: "5s", easing: "cubic-bezier(0,0,1,1)" }),
    ]);
    expect(instruction.targetAnimations[0].timing.easing).not.toBe("cubic-bezier(0,0,1,1)");
  });

  it("`loop` on a `with` repeats it without end and `once` plays it through one time", async () => {
    const { instruction } = await played("animate portrait with shake loop with spin over 2s once");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", iterations: "infinite" }),
      expect.objectContaining({ name: "spin", duration: "2s", iterations: 1 }),
    ]);
  });

  it("a `with` that is not given `loop` or `once` keeps its definition's repeat count", async () => {
    const { instruction } = await played("animate portrait with spin over 2s with shake");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "spin", iterations: "infinite" }),
      expect.objectContaining({ name: "shake", iterations: 1 }),
    ]);
  });

  it("`wait` holds the story for the longest of the travel and every `with`, each counted as its `after` plus its length", async () => {
    const { held, instruction } = await played("animate backdrop to left over 4s with shake after 3s over 1s wait");
    expect(held).toBe(4);
    expect(instruction.travel.timing).toEqual(expect.objectContaining({ delay: "0s", duration: "4s" }));
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "shake", delay: "3s", duration: "1s" }),
    ]);
  });

  it("`wait` holds for the `with` that ends last", async () => {
    const { held } = await played("animate portrait with shake over 1s with spin after 2s over 5s once wait");
    expect(held).toBe(7);
  });

  it("without `wait` the story does not hold", async () => {
    const { held } = await played("animate portrait with shake over 1s with spin over 5s");
    expect(held).toBe(0);
  });

  it("a `with` without its own length counts its definition's length for `wait`", async () => {
    const { held } = await played("animate portrait with shake with spin over 0.1s once wait");
    expect(held).toBe(0.3);
  });

  it("a `show` line with two `with` clauses still plays only its last", async () => {
    const { instruction } = await played("show portrait with shake over 1s with spin over 2s", "[[show portrait bunny]]");
    expect(instruction.targetAnimations.map(timing)).toEqual([
      expect.objectContaining({ name: "spin", duration: "2s" }),
    ]);
  });
});

describe("a line with one `with` plays the same whichever side of the `with` its timing is written on (I-2853)", () => {
  it.each([
    ["animate backdrop to bottom_right over 1s with shake", "animate backdrop to bottom_right with shake over 1s"],
    ["animate backdrop to left after 1s ease linear with shake", "animate backdrop to left with shake after 1s ease linear"],
    ["animate portrait over 2s after 0.5s with shake", "animate portrait with shake over 2s after 0.5s"],
  ])("`%s` and `%s`", async (before, after) => {
    const a = await played(before);
    const b = await played(after);
    expect(a.instruction.targetAnimations.map(timing)).toEqual(b.instruction.targetAnimations.map(timing));
    expect(a.instruction.travel?.timing).toEqual(b.instruction.travel?.timing);
    expect(a.instruction.targetAnimations).toHaveLength(1);
  });

  it("the travel and the shake both take the one `over`", async () => {
    const { instruction } = await played("animate backdrop to bottom_right with shake over 1s");
    expect(instruction.travel.timing).toEqual(expect.objectContaining({ duration: "1s" }));
    expect(instruction.targetAnimations.map(timing)).toEqual([expect.objectContaining({ name: "shake", duration: "1s" })]);
  });
});
