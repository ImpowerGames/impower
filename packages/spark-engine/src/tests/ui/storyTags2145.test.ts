import { describe, expect, test } from "vitest";
import type { Instructions } from "../../game/core/types/Instructions";
import { renderedBeat, renderedChoiceBeats, script } from "./harness/displayStyleHarness";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const BOLD = { "text-weight": "700" };

type Run = { text: string; style?: Record<string, unknown> };

const runs = (beat: Instructions, target: string): Run[] => {
  const out: Run[] = [];
  for (const event of beat.text?.[target] ?? []) {
    const style = event.style && Object.keys(event.style).length ? event.style : undefined;
    const previous = out.at(-1);
    if (previous && JSON.stringify(previous.style) === JSON.stringify(style)) {
      previous.text += event.text;
    } else {
      out.push(style ? { text: event.text, style } : { text: event.text });
    }
  }
  return out;
};

const actionRuns = async (body: string, values?: string) =>
  runs((await renderedBeat(script(body, values))).beat, "action");

const MIA = `define mia as character with
  name = "MIA"
end
`;

async function spokenBeat(line: string): Promise<Instructions> {
  const h = createHarness(`${MIA}\n\nscene start\n  MIA:\n    ${line}\nend\n`, 0);
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  h.game.destroy();
  return beat!;
}

const VALUES = `store whisper = "<speed:0.6>"\nstore nickname = "<b>Ace"\nstore x = "plain"\n`;

describe("a known look tag styles the text it encloses (#2145, #1491)", () => {
  test("A <b>word</b> here. shows word in bold", async () => {
    expect(await actionRuns("A <b>word</b> here.")).toEqual([
      { text: "A " },
      { text: "word", style: BOLD },
      { text: " here." },
    ]);
  });

  test("a look tag inside a mark keeps the mark's style and adds its own", async () => {
    expect(await actionRuns("A *a <u>b</u> c* d")).toEqual([
      { text: "A " },
      { text: "a ", style: { font_style: "italic" } },
      { text: "b", style: { font_style: "italic", "text-decoration-line": "underline" } },
      { text: " c", style: { font_style: "italic" } },
      { text: " d" },
    ]);
  });

  test("a look tag in a choice styles the menu and the echo, and the host's text is plain", async () => {
    const source = script("choose\n    + Go <b>far</b> now\n      Done.\n  end");
    const { menu, echo } = await renderedChoiceBeats(source);
    const menuText = (menu.beat.choices ?? []).length;
    expect(menuText).toBeGreaterThan(0);
    const shown = Object.keys(menu.beat.text ?? {}).flatMap((target) => runs(menu.beat, target));
    expect(shown).toContainEqual({ text: "far", style: BOLD });
    expect(runs(echo.beat, "action")).toEqual([
      { text: "Go " },
      { text: "far", style: BOLD },
      { text: " now" },
    ]);
  });
});

describe("an unknown tag is removed from the player's text (#2145)", () => {
  test("<b2> in a story line is absent", async () => {
    expect(await actionRuns("A <b2>word</b2> here.")).toEqual([{ text: "A word here." }]);
  });

  test("a tag written with an equals sign is an unknown tag", async () => {
    expect(await actionRuns("A <speed=0.5>word here.")).toEqual([{ text: "A word here." }]);
  });
});

describe("a tag inside an inserted value acts where the value lands (#2145)", () => {
  test("{whisper}Come closer. with whisper = <speed:0.6> types the line slower to its end", async () => {
    const after = (beat: Instructions) =>
      (beat.text?.["dialogue"] ?? []).map((event) => event.after ?? 0);
    const slowed = after(await spokenBeatWith("{whisper}Come closer"));
    const plain = after(await spokenBeatWith("Come closer"));
    expect(slowed.length).toBe(plain.length);
    expect(plain.at(-1)).toBeGreaterThan(0);
    expect(slowed.at(-1)! / plain.at(-1)!).toBeCloseTo(1 / 0.6);
  });

  test("Everyone calls you {nickname} around here. with nickname = <b>Ace renders Ace around here. in bold", async () => {
    expect(await actionRuns("Everyone calls you {nickname} around here.", VALUES)).toEqual([
      { text: "Everyone calls you " },
      { text: "Ace around here.", style: BOLD },
    ]);
  });
});

async function spokenBeatWith(line: string): Promise<Instructions> {
  const h = createHarness(`${MIA}\n${VALUES}\nscene start\n  MIA:\n    ${line}\nend\n`, 0);
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  h.game.destroy();
  return beat!;
}

describe("a tag's style split inside zero-delay text adds no pause, tone or beep (#2145)", () => {
  const timing = (beat: Instructions) => ({
    end: beat.end,
    audio: beat.audio,
    speech: beat.speech,
  });

  test.each([
    ["a look tag", "<speed:0>Hello <b>there</b> my friend"],
    ["a look tag with a value", "<speed:0>Hello <color:red>there</color> my friend"],
    ["an unknown tag", "<speed:0>Hello <b2>there</b2> my friend"],
  ])("%s on a spoken line shown at once", async (_label, tagged) => {
    expect(timing(await spokenBeat(tagged))).toEqual(
      timing(await spokenBeat("<speed:0>Hello there my friend")),
    );
  });

  test("a look tag on a narration line with no letter pause", async () => {
    const zero = "define action as typewriter with\n  letter_pause = 0\nend\n";
    const beatOf = async (body: string) =>
      (await renderedBeat(script(body, `${zero}store x = "plain"\n`))).beat;
    const tagged = await beatOf("Hello <b>there</b> my <i>good</i> friend");
    const plain = await beatOf("Hello there my good friend");
    expect(timing(tagged)).toEqual(timing(plain));
  });
});
