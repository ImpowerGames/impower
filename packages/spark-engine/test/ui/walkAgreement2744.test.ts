import { describe, expect, test } from "vitest";
import { layoutCasts, layoutStreams } from "@impower/sparkdown/src/compiler/utils/layoutStreams";
import { variantLayouts } from "@impower/sparkdown/src/compiler/utils/variantLayouts";
import type { Instructions } from "../../src/game/core/types/Instructions";
import { streamTemplate } from "../../src/game/modules/ui/utils/streamTemplate";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define bunny as character with
  name = "BUNNY"
end
`;

interface Case {
  name: string;
  source: string;
  shownIn: "phone" | "dialogue";
  entries?: "stream" | "cast";
}

const CASES: Case[] = [
  {
    name: "an element in the layout",
    source: `layout phone {
  dialogue #variant=receive { text }
}`,
    shownIn: "phone",
  },
  {
    name: "an element in the layout's screen body",
    source: `screen inbox {
  dialogue #variant=receive { text }
  slot
}

layout phone in inbox {
  decoration
}`,
    shownIn: "phone",
  },
  {
    name: "an element in a component two layouts use",
    source: `component incoming {
  dialogue #variant=receive { text }
}

layout phone {
  incoming
}

layout radio {
  incoming
}`,
    shownIn: "phone",
  },
  {
    name: "a stream template in the layout",
    source: `layout phone {
  stream {
    dialogue #variant=receive { text }
  }
}`,
    shownIn: "phone",
    entries: "stream",
  },
  {
    name: "a stream template in the layout's screen body",
    source: `screen inbox {
  stream {
    dialogue #variant=receive { text }
  }
  slot
}

layout phone in inbox {
  decoration
}`,
    shownIn: "dialogue",
  },
  {
    name: "a component as a stream template",
    source: `component incoming {
  dialogue #variant=receive { text }
}

layout phone {
  stream {
    incoming
  }
}`,
    shownIn: "dialogue",
  },
  {
    name: "an element nested inside a stream template",
    source: `layout phone {
  stream {
    bubble {
      dialogue #variant=receive { text }
    }
  }
}`,
    shownIn: "dialogue",
  },
  {
    name: "a cast template in the layout",
    source: `layout phone {
  cast {
    actor {
      dialogue #variant=receive { text }
    }
  }
}`,
    shownIn: "dialogue",
  },
  {
    name: "an element matched by its class, not its tag",
    source: `layout phone {
  bubble.dialogue #variant=receive { text }
}`,
    shownIn: "phone",
  },
];

const LINE: Instructions = {
  end: 0,
  variant: "receive",
  text: { dialogue: [{ text: "hello" }] },
} as Instructions;

type Harness = ReturnType<typeof createHarness>;

const ui = (h: Harness): any => h.game.module.ui;

const coordinator = (h: Harness): any => (h.game as any)._coordinator;

const mounted = (h: Harness): string[] =>
  [...ui(h)._mountedLayouts.keys()].filter(
    (name: string) => !["main", "loading", "ending"].includes(name),
  );

function wire(messages: any[]): any[] {
  return messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") && Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );
}

const writtenHello = (h: Harness): boolean =>
  wire(h.messages).some(
    (m: any) =>
      m?.method === "ui/write-text" &&
      (m.params?.instructions ?? []).map((i: any) => i.text ?? "").join("") === "hello",
  );

async function play(source: string, opened: boolean) {
  const h = createHarness(
    `${DEFS}\n${source}\n\nscene start\n${opened ? "  [[open phone]]\n" : ""}  BUNNY [receive]: hello\nend\n`,
    0,
    { autoOpenAll: false },
  );
  await h.ready;
  expect(h.errors).toEqual([]);
  h.game.context.system.previewing = undefined;
  h.game.start();
  for (let i = 0; i < 20; i += 1) {
    await flushMicrotasks(10);
    coordinator(h)?.onUpdate({ deltaMS: 0 });
  }
  await flushMicrotasks(10);
  return h;
}

const NOTE_CASES: [string, string, boolean][] = [
  ["an element in the layout", "layout note {\n  note { text }\n}", true],
  ["an element in the layout's screen body", "screen paper {\n  note { text }\n  slot\n}\n\nlayout note in paper {\n  margin\n}", true],
  ["an element in a component", "component memo {\n  note { text }\n}\n\nlayout note {\n  memo\n}", true],
  ["a stream template in the layout", "layout note {\n  stream {\n    note { text }\n  }\n}", true],
  ["an element nested inside a stream template", "layout note {\n  stream {\n    memo {\n      note { text }\n    }\n  }\n}", true],
  ["a stream template in the layout's screen body", "screen paper {\n  stream {\n    note { text }\n  }\n  slot\n}\n\nlayout note in paper {\n  margin\n}", false],
  ["a cast template in the layout", "layout note {\n  cast {\n    actor {\n      note { text }\n    }\n  }\n}", true],
  ["an element matched by its class, not its tag", "layout note {\n  memo.note { text }\n}", true],
];

describe("what a layout named after a kind holds (I-2744)", () => {
  test.each(NOTE_CASES)("%s", async (_, source, holds) => {
    const h = createHarness(`${source}\n\nscene start\n  A bell rings.\nend\n`, 0, { autoOpenAll: false });
    await h.ready;
    expect(h.errors).toEqual([]);
    expect(ui(h).layoutHolds("note", ["note"])).toBe(holds);
  });
});

describe("every walk of a layout's tree agrees with holding and routing (I-2744)", () => {
  test.each(CASES)("$name", async ({ source, shownIn, entries }) => {
    const h = await play(source, false);
    const sparkle = h.game.program?.sparkle;
    const holds = ui(h).layoutHoldsLine("phone", "dialogue", "receive");
    const limits = variantLayouts(sparkle, "dialogue", "receive").includes("phone");
    const streams = layoutStreams(sparkle, "phone").some((node) => streamTemplate(node, LINE) >= 0);
    const casts = layoutCasts(sparkle, "phone").length > 0;
    const opened = mounted(h);
    const shows = shownIn === "phone";
    expect({ holds, limits, opened: opened.includes("phone") }).toEqual({
      holds: shows,
      limits: shows,
      opened: shows,
    });
    expect(opened).toContain(shownIn);
    expect(streams).toBe(entries === "stream");
    if (entries === "stream") {
      expect(ui(h).streams.entries("phone")).toHaveLength(1);
    }
    if (casts) {
      expect(holds).toBe(false);
    }
    expect(writtenHello(h)).toBe(true);
  });

  test.each(CASES)("$name, in a layout the author opened", async ({ source, shownIn, entries }) => {
    const h = await play(source, true);
    const holds = ui(h).layoutHoldsLine("phone", "dialogue", "receive");
    const opened = mounted(h);
    expect(opened).toContain("phone");
    expect(holds).toBe(shownIn === "phone");
    expect(opened.includes("dialogue")).toBe(shownIn === "dialogue");
    if (entries === "stream") {
      expect(ui(h).streams.entries("phone")).toHaveLength(1);
    }
    expect(writtenHello(h)).toBe(true);
  });
});
