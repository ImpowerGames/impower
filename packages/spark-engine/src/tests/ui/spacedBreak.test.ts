import { describe, expect, test } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import {
  compileUI,
  createHarness,
  flushMicrotasks,
  MAIN_URI,
} from "./harness/uiTestHarness";

const DEFS = `define HERO as character with
  name = "HERO"
end

define VILLAIN as character with
  name = "VILLAIN"
end

define BG as image with
  src = "https://example.com/bg.png"
end

layout main with
  stage {
    backdrop {
      image
    }
  }
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
    action {
      text
    }
  }
end
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

const typed = (beat: any): string =>
  Object.entries(beat?.text ?? {})
    .filter(([target]) => !target.startsWith("character_"))
    .flatMap(([, events]) => events as any[])
    .map((event: any) => event.text ?? "")
    .join("");

const cue = (beat: any): string =>
  ((beat?.text?.character_name ?? []) as any[])
    .map((event: any) => event.text ?? "")
    .join("");

const advancesByItself = (harness: any, beat: any): boolean =>
  new Coordinator(harness.game, beat).shouldContinue() > 0;

describe("spaced `>` break", () => {
  test("a lone `>` shows an empty box and waits for a click", async () => {
    const harness = createHarness(
      story(`  HERO: Hi.\n  >\n  HERO: Bye.`),
    );
    await harness.ready;
    harness.jumpToFlow("start");
    expect(typed(harness.nextBeat())).toBe("Hi.");

    const pause = harness.nextBeat();
    expect(pause?.text).toBeDefined();
    expect(typed(pause)).toBe("");
    expect(advancesByItself(harness, pause)).toBe(false);
    harness.reset();
    await harness.display(pause!, true);
    await flushMicrotasks();
    expect(harness.snapshotWire("ui/")).toMatchSnapshot();

    expect(typed(harness.nextBeat())).toBe("Bye.");
  });

  test("a break on a glued continuation keeps the cue of the line it continues", async () => {
    const harness = createHarness(story(`  HERO: Hi. ..\n  .. more > Bye.`));
    await harness.ready;
    harness.jumpToFlow("start");
    const joined = harness.nextBeat();
    expect(typed(joined)).toBe("Hi. more");
    expect(Object.keys(joined?.text ?? {}).sort()).toEqual([
      "character_name",
      "dialogue",
    ]);
    expect(advancesByItself(harness, joined)).toBe(false);
    const after = harness.nextBeat();
    expect(typed(after)).toBe("Bye.");
    expect(Object.keys(after?.text ?? {}).sort()).toEqual([
      "character_name",
      "dialogue",
    ]);
  });

  test("a continuation's beat reached on its own keeps its own line's cue", async () => {
    const source = story(
      `  HERO: A. ..\n  .. hero joined > Hero after.\n  VILLAIN: V. ..\n  .. villain joined > Villain after.`,
    );
    const harness = createHarness(source);
    await harness.ready;
    harness.jumpToFlow("start");
    expect(cue(harness.nextBeat())).toBe("HERO");

    const program = harness.game.program;
    const line = source
      .split("\n")
      .findIndex((l) => l.includes("villain joined"));
    const path = programLocator(program).addressAt(MAIN_URI, line, {
      beat: "last",
    });
    expect(path).toBeDefined();
    harness.jumpTo(path!);
    const beat = harness.nextBeat();
    expect(typed(beat)).toBe("Villain after.");
    expect(cue(beat)).toBe("VILLAIN");
  });

  test("a step holding several continuations is remembered by the last", async () => {
    const harness = createHarness(
      `${DEFS}\n-> start\n\nscene start\n  HERO: A -> later\nend\n\nscene later\n  VILLAIN: B ..\n  .. C ..\n  .. D > E\nend\n`,
    );
    await harness.ready;
    harness.jumpToFlow("start");
    const joined = harness.nextBeat();
    expect(typed(joined)).toBe("A B C D");
    expect(cue(joined)).toBe("HERO");
    const after = harness.nextBeat();
    expect(typed(after)).toBe("E");
    expect(cue(after)).toBe("HERO");
  });

  test("an inherited beat and a newer continuation can share a step", async () => {
    const harness = createHarness(
      `${DEFS}\n-> start\n\nscene start\n  HERO: A -> later\nend\n\nscene later\n  VILLAIN: B ..\n  .. C > D ..\n  .. E > F\nend\n`,
    );
    await harness.ready;
    harness.jumpToFlow("start");
    const beats = [
      harness.nextBeat(),
      harness.nextBeat(),
      harness.nextBeat(),
    ];
    expect(beats.map(typed)).toEqual(["A B C", "D E", "F"]);
    expect(beats.map(cue)).toEqual(["HERO", "HERO", "HERO"]);
  });

  test("a comment between a line and its continuation keeps the cue", async () => {
    for (const body of [
      `  HERO: A ..\n  // note\n  .. B > C`,
      `  HERO: A ..\n  // note\n  // another\n  .. B > C`,
    ]) {
      const harness = createHarness(story(body));
      await harness.ready;
      harness.jumpToFlow("start");
      const joined = harness.nextBeat();
      expect(typed(joined)).toBe("A B");
      const after = harness.nextBeat();
      expect(typed(after)).toBe("C");
      expect(cue(after)).toBe("HERO");
    }
  });

  test("routing a continuation remembers does not outlive its run", async () => {
    const source = `${DEFS}\n-> start\n\nscene start\n  HERO: A -> later\nend\n\nscene later\n  VILLAIN: B ..\n  .. joined > After.\nend\n`;
    const line = source.split("\n").findIndex((l) => l.includes("joined"));
    const primed = async () => {
      const harness = createHarness(source);
      await harness.ready;
      harness.jumpToFlow("start");
      expect(cue(harness.nextBeat())).toBe("HERO");
      return harness;
    };
    const lastBeatOf = (harness: any) =>
      programLocator(harness.game.program).addressAt(MAIN_URI, line, {
        beat: "last",
      })!;

    const abandoned = await primed();
    abandoned.game.module.interpreter.clearQueuedBeats();
    abandoned.jumpTo(lastBeatOf(abandoned));
    const afterAbandon = abandoned.nextBeat();
    expect(typed(afterAbandon)).toBe("After.");
    expect(cue(afterAbandon)).toBe("VILLAIN");

    const updated = await primed();
    updated.game.updateProgram(compileUI(source).program as any);
    updated.jumpTo(lastBeatOf(updated));
    const afterUpdate = updated.nextBeat();
    expect(typed(afterUpdate)).toBe("After.");
    expect(cue(afterUpdate)).toBe("VILLAIN");
  });

  test("a beat never inherits from a continuation of another file", async () => {
    const INCLUDE = "inmemory:///evil.sd";
    const main = `${DEFS}\n-> start\n\nscene start\n  HERO: A. ..\n  .. joined > After.\nend\n`;
    const head = `scene evil\n  EVIL: `;
    const evil = `${head}${"B".repeat(
      main.indexOf("  .. joined") - head.length - 5,
    )}. ..\n  .. joined > After.\nend\n`;
    expect(evil.indexOf("  .. joined")).toBe(main.indexOf("  .. joined"));
    const harness = createHarness(main, 0, { scripts: { [INCLUDE]: evil } });
    await harness.ready;
    harness.jumpToFlow("start");
    expect(cue(harness.nextBeat())).toBe("HERO");

    const line = evil.split("\n").findIndex((l) => l.includes("joined"));
    const path = programLocator(harness.game.program).addressAt(INCLUDE, line, {
      beat: "last",
    });
    expect(path).toBeDefined();
    harness.jumpTo(path!);
    const beat = harness.nextBeat();
    expect(typed(beat)).toBe("After.");
    expect(cue(beat)).toBe("EVIL");
  });

  test("a picture line ending in `>` shows the picture and waits", async () => {
    const harness = createHarness(
      story(`  [[show backdrop BG]] >\n  Next.`),
    );
    await harness.ready;
    harness.jumpToFlow("start");

    const picture = harness.nextBeat();
    expect(picture?.image).toBeDefined();
    expect(typed(picture)).toBe("");
    expect(advancesByItself(harness, picture)).toBe(false);

    expect(typed(harness.nextBeat())).toBe("Next.");
  });
});
