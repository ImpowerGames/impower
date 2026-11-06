import { describe, expect, test } from "vitest";
import { type Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { type Game } from "../../game/core/classes/Game";
import type { Instructions } from "../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const STORY = `define HERO as character with
  name = "Hero"
end

define BG as image with
  src = "https://example.com/bg.png"
end

layout main {
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
      character_parenthetical {
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
  continue_indicator {
    text
  }
  choice.0 {
    text
  }
  choice.1 {
    text
  }
  choice.2 {
    text
  }
}


scene start
  [[show backdrop BG]]
  The hall is quiet.

  HERO (softly): Who goes there?

  choose
    Answer:
    + (a) A friend
      Welcome, friend.
      -> DONE
    + (b) A stranger
      Leave at once.
      -> DONE
    + (c) Nobody
      Then nobody may pass.
      -> DONE
  end
end
`;

const UI_WRITES = [
  "beginCompose",
  "endCompose",
  "composeWait",
  "afterCompose",
  "applyLayoutInstructions",
  "showLayout",
  "reveal",
  "refreshLayouts",
  "observe",
  "unobserve",
  "hideAll",
  "runCutscene",
  "skipCutscene",
] as const;

const serialize = (value: unknown): unknown =>
  value === undefined
    ? "[undefined]"
    : JSON.parse(
        JSON.stringify(value, (_key, inner) =>
          typeof inner === "function"
            ? "[function]"
            : inner === undefined
              ? "[undefined]"
              : inner,
        ),
      );

const recordCalls = (
  log: unknown[],
  owner: Record<string, any>,
  prefix: string,
  names: readonly string[],
  read: (args: unknown[]) => unknown[] = (args) => args,
) => {
  for (const name of names) {
    const original = owner[name].bind(owner);
    owner[name] = (...args: unknown[]) => {
      log.push([`${prefix}${name}`, ...read(args).map(serialize)]);
      return original(...args);
    };
  }
};

const restoreClearedReads = ([beat]: unknown[]): unknown[] => {
  const { image, extended } = beat as Pick<Instructions, "image" | "extended">;
  return [{ image, extended }];
};

const recordUiWrites = (game: Game): unknown[] => {
  const log: unknown[] = [];
  const ui = game.module.ui as unknown as Record<string, any>;
  recordCalls(log, ui, "ui.", UI_WRITES);
  recordCalls(log, ui["text"], "ui.text.", ["clearAll", "write"]);
  recordCalls(log, ui["image"], "ui.image.", ["clearAll", "write"]);
  recordCalls(
    log,
    ui["image"],
    "ui.image.",
    ["restoreCleared"],
    restoreClearedReads,
  );
  recordCalls(log, ui["style"], "ui.style.", ["update"]);
  const choose = game.chosePathToContinue.bind(game);
  game.chosePathToContinue = (index: number) => {
    log.push(["game.chosePathToContinue", index]);
    return choose(index);
  };
  return log;
};

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

const observedElements = (messages: any[]): string[] =>
  messages.flatMap((m) =>
    m?.method === "ui/observe"
      ? [m.params.element as string]
      : Array.isArray(m?.params?.messages)
        ? observedElements(m.params.messages)
        : [],
  );

const pointerDown = {
  jsonrpc: "2.0",
  method: "event",
  params: { type: "pointerdown", button: 0 },
} as any;

async function start(previewing: boolean, composeBeats = false) {
  const h = createHarness(STORY, 0, {
    beforeConnect: (game) => {
      game.context.system.previewing = previewing ? true : undefined;
      game.context.system.composeBeats = composeBeats;
    },
  });
  await h.ready;
  h.jumpToFlow("start");
  await flushMicrotasks(10);
  const log = recordUiWrites(h.game);
  return { h, log };
}

describe("the UI writes the Coordinator makes for a beat (#1988)", () => {
  test.each([
    ["one write at a time", false],
    ["composed into one page beat", true],
  ])(
    "a played story, %s: an image cue with narration, dialogue revealed mid-type, a choice menu and a pick",
    async (_name, composeBeats) => {
      const { h, log } = await start(false, composeBeats);
      for (let n = 0; n < 3; n += 1) {
        const beat = h.nextBeat();
        expect(beat).toBeTruthy();
        log.push(["beat", n]);
        const coordinator = new Coordinator(h.game, beat!);
        await flushMicrotasks(10);
        coordinator.onUpdate(tick());
        await flushMicrotasks(10);
        if (n === 1) {
          log.push(["interact"]);
          coordinator.onMessage(pointerDown);
          coordinator.onUpdate(tick());
          await flushMicrotasks(10);
        }
        coordinator.onUpdate(tick(60_000));
        await flushMicrotasks(10);
        coordinator.onUpdate(tick());
        await flushMicrotasks(10);
      }
      const observed = observedElements(h.messages).slice(-3);
      expect(observed).toHaveLength(3);
      log.push(["pick", 1]);
      h.emitEvent("click", observed[1]!, { button: 0 });
      await flushMicrotasks(10);
      expect(log).toContainEqual(["game.chosePathToContinue", 1]);
      expect(log).toMatchSnapshot();
    },
  );

  test("a previewed story: every beat shown at once", async () => {
    const { h, log } = await start(true);
    for (let n = 0; n < 3; n += 1) {
      const beat = h.nextBeat();
      expect(beat).toBeTruthy();
      log.push(["beat", n]);
      new Coordinator(h.game, beat!);
      await flushMicrotasks(10);
    }
    expect(log).toMatchSnapshot();
  });
});
