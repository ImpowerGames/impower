import { describe, expect, test } from "vitest";
import { testCompiler, testStory, type TestStory } from "../engineUnderTest";
import {
  continueShowedSomething,
  displayRouting,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import { programListing, stringCount } from "../programListing";
type RuntimeStory = TestStory;

type Routing = { target?: string; character?: string };

function stepsWith<T>(
  story: RuntimeStory,
  read: (story: RuntimeStory) => T,
): [string, T][] {
  const out: [string, T][] = [];
  while (story.canContinue) {
    story.Continue();
    if (!continueShowedSomething(story)) continue;
    const text = story.currentDisplayInstructions
      .map(
        (table) =>
          (table.value?.get("text") as { value?: unknown } | undefined)
            ?.value ?? "",
      )
      .join("");
    out.push([`${text}\n`, read(story)]);
  }
  return out;
}

function steps(story: RuntimeStory): [string, Routing[]][] {
  return stepsWith(story, displayRouting);
}

function texts(story: RuntimeStory): string[] {
  return steps(story).map(([text]) => text);
}

function flags(story: RuntimeStory, flag: string): boolean[] {
  return story.currentDisplayInstructions.map(
    (table) =>
      (table.value?.get(flag) as { value?: unknown } | undefined)?.value ===
      true,
  );
}

function inStart(source: string): string {
  const body: string[] = [];
  const declarations: string[] = [];
  let inDeclaration = false;
  for (const line of source.split("\n")) {
    if (inDeclaration) {
      declarations.push(line);
      inDeclaration = line !== "end";
    } else if (/^(function|scene|define)\b/.test(line)) {
      declarations.push(line);
      inDeclaration = true;
    } else if (/^(store|const|external|type)\b/.test(line)) {
      declarations.push(line);
    } else {
      body.push(line);
    }
  }
  const text = (lines: string[]) => lines.join("\n");
  const indented = text(body)
    .replace(/^(?=.)/gm, "  ")
    .replace(/\n*$/, "\n");
  return `scene start\n${indented}end\n${text(declarations)}`;
}

function makeStory(source: string) {
  return makeRuntimeStoryFromSource(inStart(source));
}

const BASE = "inmemory:///";
const URI = `${BASE}main.sd`;

function compile(text: string, others: Record<string, string> = {}) {
  const compiler = testCompiler();
  compiler.configure({
    files: Object.entries({ ...others, "main.sd": text }).map(
      ([path, source]) => ({
        uri: `${BASE}${path}`,
        type: "script" as const,
        name: path.replace(/\.sd$/, ""),
        ext: "sd",
        text: path === "main.sd" ? inStart(source) : source,
        version: 1,
        languageId: "sparkdown",
      }),
    ),
  });
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function errorsOf(text: string) {
  return errorsIn(compile(text));
}

function errorsIn(program: { diagnostics?: Record<string, any[]> }) {
  return Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1)
    .map((d) => ({
      message: String(d.message?.value ?? d.message),
      start: d.range.start,
      end: d.range.end,
    }));
}

function programShape(text: string) {
  const ctx = makeStory(text);
  expect(ctx.errorMessages).toEqual([]);
  const all = programListing(ctx.root);
  return {
    display: all.filter((t) => /^CallStd display\/1\b/.test(t)).length,
    open: stringCount(all, "open"),
    glue: stringCount(all, "glue"),
    extend: stringCount(all, "extend"),
    caption: stringCount(all, "caption"),
  };
}

const TYPES: {
  label: string;
  inline: string;
  block: string;
  routing: Routing;
}[] = [
  { label: "action", inline: "", block: ":", routing: { target: "action" } },
  {
    label: "dialogue",
    inline: "ALICE: ",
    block: "ALICE:",
    routing: { target: "dialogue", character: "ALICE" },
  },
  {
    label: "heading",
    inline: "$: ",
    block: "$:",
    routing: { target: "heading" },
  },
  { label: "title", inline: "^: ", block: "^:", routing: { target: "title" } },
  {
    label: "transitional",
    inline: "%: ",
    block: "%:",
    routing: { target: "transitional" },
  },
  {
    label: "write",
    inline: "@hud: ",
    block: "@hud:",
    routing: { target: "hud" },
  },
];

const SPACINGS: { first: string; joined: string }[] = [
  { first: "A ..", joined: "A B\n" },
  { first: "A   ..", joined: "A   B\n" },
  { first: "A..", joined: "AB\n" },
  { first: "A ..   ", joined: "A B\n" },
];

describe("a trailing `..` joins the next line that begins with `..`", () => {
  for (const { label, inline, block, routing } of TYPES) {
    const own = label === "action" ? {} : routing;
    for (const { first, joined } of SPACINGS) {
      test(`${label}: ${JSON.stringify(first)} then .. B`, () => {
        const ctx = makeStory(
          `${inline}${first}\n${inline}.. B\n`,
        );
        expect(ctx.errorMessages).toEqual([]);
        expect(steps(ctx.story)).toEqual([[joined, [routing, own]]]);
      });

      test(`${label} block: ${JSON.stringify(first)} then .. B`, () => {
        const ctx = makeStory(
          `${block}\n  ${first}\n  .. B\n`,
        );
        expect(ctx.errorMessages).toEqual([]);
        expect(steps(ctx.story)).toEqual([[joined, [routing]]]);
      });
    }

    test(`${label}: a chain of three`, () => {
      const ctx = makeStory(
        `${inline}a ..\n${inline}.. b..\n${inline}..c.\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(steps(ctx.story)).toEqual([["a bc.\n", [routing, own, own]]]);
    });

    test(`${label}: a join into each branch of an if`, () => {
      for (const [value, word] of [
        ["true", "door."],
        ["false", "wall."],
      ]) {
        const ctx = makeStory(
          `store c = ${value}\n${inline}You see a ..\nif c then\n  .. door.\nelse\n  .. wall.\nend\n`,
        );
        expect(ctx.errorMessages).toEqual([]);
        expect(texts(ctx.story)).toEqual([`You see a ${word}\n`]);
      }
    });

    test(`${label}: a branch's first line keeps the routing of the line it joins`, () => {
      for (const block of [
        `if true then\n  .. B > C\nend`,
        `if false then\n  X.\nelseif true then\n  .. B > C\nend`,
        `if false then\n  X.\nelse\n  .. B > C\nend`,
        `if true then\n  if true then\n    .. B > C\n  end\nend`,
        `queue\n  | .. B > C\nend`,
      ]) {
        const ctx = makeStory(`${inline}A ..\n${block}\n`);
        expect(ctx.errorMessages).toEqual([]);
        expect(steps(ctx.story)).toEqual([
          ["A B\n", [routing, {}]],
          ["C\n", [routing]],
        ]);
      }
    });

    test(`${label}: a join after a divert`, () => {
      const ctx = makeStory(
        `${inline}You go -> outdoors\n\nscene outdoors\n  outside.\nend\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual(["You go outside.\n"]);
    });
  }

  test("an interpolation line that ends with `..`", () => {
    const ctx = makeStory(
      `store n = 3\nYou have ..\n.. {n} ..\n.. coins.\nAfter.\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(texts(ctx.story)).toEqual(["You have 3 coins.\n", "After.\n"]);
  });

  test("an interpolation line that ends with marks and a tag or comment", () => {
    for (const [source, joined] of [
      [`{3} .. # tag\n.. B\n`, "3 B\n"],
      [`{3} .. // note\n.. B\n`, "3 B\n"],
    ] as const) {
      const ctx = makeStory(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual([joined]);
      const again = makeStory(source);
      again.story.Continue();
      expect(flags(again.story, "pause")).toEqual([false, false]);
    }
    for (const [source, before] of [
      [`{3}.. >\n.. B\n`, "3\n"],
      [`{3} .. >\n.. B\n`, "3 \n"],
      [`{3} .. > # tag\n.. B\n`, "3 \n"],
    ] as const) {
      const ctx = makeStory(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual([before, "B\n"]);
      const again = makeStory(source);
      again.story.Continue();
      expect(flags(again.story, "pause")).toEqual([true]);
      expect(flags(again.story, "extend")).toEqual([true]);
    }
  });

  test("an interpolation line's breaks each end a beat", () => {
    for (const [source, expected] of [
      [`{3} >\nB\n`, [["3\n", [true]], ["B\n", [false]]]],
      [
        `{3} > >\nB\n`,
        [
          ["3\n", [true]],
          ["\n", [true]],
          ["B\n", [false]],
        ],
      ],
      [
        `{3} > >..\nB\nAfter.\n`,
        [
          ["3\n", [true]],
          ["\n", [true]],
          ["B\n", [false]],
          ["After.\n", [false]],
        ],
      ],
    ] as const) {
      const ctx = makeStory(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(
        stepsWith(ctx.story, (story) => flags(story, "pause")),
      ).toEqual(expected);
    }
  });

  test("a `..` after an interpolation in the middle of a line is text", () => {
    for (const [source, shown] of [
      [`{3} .. and more.\n`, "3 .. and more.\n"],
      [`{3}..and more.\n`, "3..and more.\n"],
    ] as const) {
      const ctx = makeStory(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual([shown]);
    }
  });

  test("a tag after the mark on a block's last line keeps the join", () => {
    for (const [first, joined] of [
      ["A .. # marker", ["A B\n"]],
      ["A .. > # marker", ["A \n", "B\n"]],
    ] as const) {
      const ctx = makeStory(`ALICE:\n  ${first}\n.. B\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual(joined);
    }
  });

  test("a tag or comment after the mark keeps the next line a continuation", () => {
    for (const source of [
      `HERO: A .. # note\n.. B > C\n`,
      `HERO: A .. // note\n.. B > C\n`,
      `A .. # note\n.. B\n`,
    ]) {
      const ctx = makeStory(source);
      expect(ctx.errorMessages).toEqual([]);
      const out = steps(ctx.story);
      expect(out[0]![1][1]).toEqual({});
      if (source.startsWith("HERO")) {
        expect(out).toEqual([
          ["A B\n", [{ target: "dialogue", character: "HERO" }, {}]],
          ["C\n", [{ target: "dialogue", character: "HERO" }]],
        ]);
      }
    }
  });

  test("a tag after the mark keeps a block body's join", () => {
    for (const block of [`ALICE:`, `:`]) {
      const ctx = makeStory(
        `${block}\n  Hello .. # marker\n  .. world.\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual(["Hello world.\n"]);
      const lone = makeStory(
        `${block}\n  Hello .. # marker\n  world.\n`,
      );
      expect(texts(lone.story)).toEqual(["Hello\nworld.\n"]);
    }
  });

  test("a tag or comment after `.. >` keeps the break", () => {
    for (const source of [`A .. > # tag\n.. B\n`, `A .. > // note\n.. B\n`]) {
      const ctx = makeStory(source);
      expect(ctx.errorMessages).toEqual([]);
      ctx.story.Continue();
      expect(flags(ctx.story, "pause")).toEqual([true]);
      expect(flags(ctx.story, "extend")).toEqual([true]);
      const again = makeStory(source);
      expect(texts(again.story)).toEqual(["A \n", "B\n"]);
    }
  });

  test("a `load` line after a line that ends with `..` stays a directive", () => {
    const ctx = makeStory(`A ..\nload overworld\nB\n`);
    expect(ctx.errorMessages).toEqual([]);
    const loads = () =>
      ctx.story.currentDisplayInstructions.map(
        (table) =>
          (table.value?.get("load") as { value?: unknown } | undefined)?.value,
      );
    ctx.story.Continue();
    expect(loads()).toEqual([undefined]);
    ctx.story.Continue();
    expect(loads()).toEqual(["overworld"]);
    expect(texts(ctx.story)).toEqual(["B\n"]);
  });

  test("an ellipsis and a mid-line `..` stay text", () => {
    const ctx = makeStory(`Wait...\na..b\nHi ...\nB\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(texts(ctx.story)).toEqual(["Wait...\n", "a..b\n", "Hi ...\n", "B\n"]);
  });
});

describe("a `..` before a `>` that ends a line offers the break's box", () => {
  for (const [first, before] of [
    ["A.. >", "A"],
    ["A .. >", "A "],
    ["Abso.. >", "Abso"],
  ] as const) {
    test(JSON.stringify(first), () => {
      const second = first.startsWith("Abso") ? "lutely." : "B";
      const source = `${first}\n..${second}\n`;
      const ctx = makeStory(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual([`${before}\n`, `${second}\n`]);
      const again = makeStory(source);
      again.story.Continue();
      expect(flags(again.story, "pause")).toEqual([true]);
      expect(flags(again.story, "extend")).toEqual([true]);
      again.story.Continue();
      expect(flags(again.story, "extend")).toEqual([false]);
      expect(flags(again.story, "continues")).toEqual([true]);
    });
  }
});

describe("a bare `..` line", () => {
  test("shows nothing and reports nothing", () => {
    const source = `A\n  ..\nB\n`;
    expect(errorsOf(source)).toEqual([]);
    const ctx = makeStory(source);
    expect(texts(ctx.story)).toEqual(["A\n", "B\n"]);
  });
});

describe("a `load` line that ends with `..`", () => {
  test("is an error and joins nothing", () => {
    const source = `load overworld ..\nUnderworld.\n`;
    expect(errorsOf(source)).toEqual([
      {
        message:
          "A `load` line cannot end with `..`. Name every asset it loads on the line.",
        start: { line: 1, character: 17 },
        end: { line: 1, character: 19 },
      },
    ]);
    const ctx = makeStory(source);
    ctx.story.Continue();
    expect(
      ctx.story.currentDisplayInstructions.map((table) =>
        (table.value?.get("load") as { value?: unknown } | undefined)?.value,
      ),
    ).toEqual(["overworld"]);
    expect(steps(ctx.story)).toEqual([
      ["Underworld.\n", [{ target: "action" }]],
    ]);
  });
});

describe("a choose block's caption", () => {
  test("shows with its choices from one continue", () => {
    const ctx = makeStory(
      `store x = 0
choose
  ALICE: Pick one.
  & x = x + 1
  * One
  * Two
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick one.");
    expect(displayRouting(ctx.story)).toEqual([
      { target: "dialogue", character: "ALICE" },
    ]);
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One", "Two"]);
    expect(ctx.story.canContinue).toBe(false);
    expect(ctx.story.variablesState.$("x")).toBe(1);
  });

  test("runs through an external call to its choices", () => {
    const ctx = makeStory(
      `external ring()

choose
  ALICE: Pick one.
  & ring()
  * One
  * Two
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    let rings = 0;
    ctx.story.BindExternalFunction("ring", () => {
      rings++;
    });
    expect(ctx.story.Continue()).toBe("Pick one.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One", "Two"]);
    expect(rings).toBe(1);
  });

  test("runs through a conditional that only runs logic", () => {
    const ctx = makeStory(
      `external ring()\n\nchoose\n  Pick.\n  if true then\n    & ring()\n  end\n  * One\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    let rings = 0;
    ctx.story.BindExternalFunction("ring", () => {
      rings++;
    });
    expect(ctx.story.Continue()).toBe("Pick.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    expect(rings).toBe(1);
  });

  test("runs through an external another script of the project declares", () => {
    const program = compile(
      `choose\n  Pick.\n  & ring()\n  * One\nend\n`,
      { "api.sd": `external ring()\n` },
    );
    expect(errorsIn(program)).toEqual([]);
    const story = testStory(program.chunks);
    let rings = 0;
    story.BindExternalFunction("ring", () => {
      rings++;
    });
    expect(story.Continue()).toBe("Pick.");
    expect(story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    expect(rings).toBe(1);
  });

  test("closes its line before a function another script of the project defines", () => {
    const program = compile(
      `choose\n  Pick.\n  & aside()\n  * One\nend\n`,
      { "api.sd": `function aside()\n  print("Aside.")\nend\n` },
    );
    expect(errorsIn(program)).toEqual([]);
    const story = testStory(program.chunks);
    expect(story.Continue()).toBe("Pick.\n");
  });

  test("runs through a pure stdlib call", () => {
    const ctx = makeStory(
      `store x = -2\nchoose\n  Pick.\n  & x = math.abs(x)\n  * One\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    expect(ctx.story.variablesState.$("x")).toBe(2);
  });

  test("runs through calls that show nothing on this run", () => {
    for (const between of [
      `& assert(true)`,
      `& quiet()`,
      `& pcall(aside)`,
      `if false then\n    Also.\n  end`,
    ]) {
      const ctx = makeStory(
        `choose\n  Pick.\n  ${between}\n  * One\nend\n\nfunction quiet()\n  local x = 1\nend\n\nfunction aside()\n  print("Aside.")\nend\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.Continue()).toBe("Pick.");
      expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    }
  });

  test("runs through to a first choice inside a conditional", () => {
    const ctx = makeStory(
      `choose\n  Pick.\n  if true then\n    * One\n  end\n  * Two\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One", "Two"]);
  });

  test("runs through to choices that are all inside a conditional", () => {
    const ctx = makeStory(
      `external ring()\n\nchoose\n  Pick.\n  & ring()\n  if true then\n    * One\n  end\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    let rings = 0;
    ctx.story.BindExternalFunction("ring", () => {
      rings++;
    });
    expect(ctx.story.Continue()).toBe("Pick.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    expect(rings).toBe(1);
  });

  test("ends its step before a stdlib function pcall calls directly", () => {
    const ctx = makeStory(
      `choose\n  Pick.\n  & pcall(print, "Aside.")\n  * One\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    expect(ctx.story.Continue()).toBe("Aside.\n");
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  test("ends its step where something shows, and the next continue starts with it", () => {
    const ctx = makeStory(
      `choose\n  Pick.\n  & aside()\n  * One\nend\n\nfunction aside()\n  print("Aside.")\n  print("More.")\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    expect(ctx.story.currentChoices).toEqual([]);
    expect(ctx.story.Continue()).toBe("Aside.\n");
    expect(ctx.story.Continue()).toBe("More.\n");
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  test("runs the step that shows after it once, before the next continue", () => {
    const source = `store count = 0\nchoose\n  Pick.\n  & aside()\n  * One\nend\n\nfunction aside()\n  count = count + 1\n  print("Aside.")\nend\n`;
    const ctx = makeStory(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    expect(ctx.story.variablesState.$("count")).toBe(1);
    const saved = ctx.story.state.ToJson();
    expect(ctx.story.Continue()?.trim()).toBe("Aside.");
    expect(ctx.story.variablesState.$("count")).toBe(1);
    const again = makeStory(source);
    again.story.state.LoadJson(saved);
    expect(again.story.Continue()?.trim()).toBe("Aside.");
    expect(again.story.variablesState.$("count")).toBe(1);
    expect(again.story.Continue()).toBe("");
    expect(again.story.variablesState.$("count")).toBe(1);
    expect(again.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  test("reports the lines the carried step ran in the continue that shows them", () => {
    const source = `choose\n  Pick.\n  if true then\n    Something shows first.\n  end\n  * One\nend\n`;
    const ctx = makeStory(source);
    expect(ctx.errorMessages).toEqual([]);
    const lines = (addresses: number[]) => [
      ...new Set(addresses.map((a) => ctx.root.locationOf(a)?.startLine)),
    ];
    const run = (story: RuntimeStory) => {
      const executed: number[] = [];
      const beat: number[] = [];
      story.executedLog = executed;
      story.beatLog = beat;
      const text = story.Continue();
      story.executedLog = null;
      story.beatLog = null;
      return { text, ran: lines(executed), beat: lines(beat) };
    };
    expect(run(ctx.story)).toEqual({
      text: "Pick.\n",
      ran: [2, 3, 4],
      beat: [2],
    });
    const saved = ctx.story.state.ToJson();
    const durable = ctx.story.toSave();
    expect(run(ctx.story)).toEqual({
      text: "Something shows first.\n",
      ran: [],
      beat: [3, 4],
    });
    const again = testStory(ctx.root);
    again.state.LoadJson(saved);
    expect(run(again)).toEqual({
      text: "Something shows first.\n",
      ran: [],
      beat: [3, 4],
    });
    const loaded = testStory(ctx.root);
    loaded.loadSave(durable);
    expect(run(loaded)).toEqual({
      text: "Something shows first.\n",
      ran: [],
      beat: [3, 4],
    });
  });

  test("logs a joined line with the beat it joins", () => {
    const beats = (source: string) => {
      const ctx = makeStory(source);
      expect(ctx.errorMessages).toEqual([]);
      const out: [string | null, (number | undefined)[]][] = [];
      while (ctx.story.canContinue) {
        const beat: number[] = [];
        ctx.story.beatLog = beat;
        const text = ctx.story.Continue();
        ctx.story.beatLog = null;
        out.push([
          text,
          [...new Set(beat.map((a) => ctx.root.locationOf(a)?.startLine))],
        ]);
      }
      return out;
    };
    expect(beats(`A ..\n.. B..\nC.\n`)).toEqual([
      ["A B\n", [1, 2]],
      ["C.\n", [3]],
      ["", [4]],
    ]);
    expect(beats(`A ..\n.. B..\n.. C.\nD.\n`)).toEqual([
      ["A BC.\n", [1, 2, 3]],
      ["D.\n", [4]],
      ["", [5]],
    ]);
    expect(
      beats(
        `choose\n  Pick ..\n  .. more.\n  if true then\n    Shown.\n  end\n  * One\nend\n`,
      ).slice(0, 2),
    ).toEqual([
      ["Pick more.\n", [2, 3]],
      ["Shown.\n", [4, 5]],
    ]);
  });

  test("logs each instruction a run executes for exactly one beat", () => {
    for (const source of [
      `choose\n  Pick.\n  if true then\n    Something shows first.\n  end\n  * One\nend\n`,
      `choose\n  Outer.\n  if true then\n    choose\n      Inner.\n      & print("Aside.")\n      * Inner choice\n    end\n  end\n  * Outer choice\nend\n`,
      `choose\n  Pick.\n  & aside()\n  * One\nend\n\nfunction aside()\n  print("Aside.")\n  print("More.")\nend\n`,
      `store x = 0\nchoose\n  Pick.\n  if true then\n    & x = 1\n  end\n  * One\nend\n`,
      `A ..\nif true then\n  .. B\nend\nC.\n`,
      `Line one. #mood\nLine two.\n`,
    ]) {
      const ctx = makeStory(source);
      expect(ctx.errorMessages).toEqual([]);
      const executed: number[] = [];
      const beat: number[] = [];
      ctx.story.executedLog = executed;
      ctx.story.beatLog = beat;
      for (let turn = 0; turn < 3; turn += 1) {
        while (ctx.story.canContinue) ctx.story.Continue();
        if (ctx.story.currentChoices.length === 0) break;
        ctx.story.ChooseChoiceIndex(0);
      }
      const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
      expect(executed.length).toBeGreaterThan(0);
      expect(sorted(beat)).toEqual(sorted(executed));
    }
  });

  test("carries a caption's own waiting line end", () => {
    const source = `choose\n  Outer.\n  if true then\n    choose\n      Inner.\n      & print("Aside.")\n      * Inner choice\n    end\n  end\n  * Outer choice\nend\n`;
    const ctx = makeStory(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(texts(ctx.story)).toEqual([
      "Outer.\n",
      "Inner.\n",
      "Aside.\n",
      "\n",
    ]);
    const first = makeStory(source);
    expect(first.story.Continue()).toBe("Outer.\n");
    const again = makeStory(source);
    again.story.state.LoadJson(first.story.state.ToJson());
    expect(again.story.Continue()).toBe("Inner.\n");
    expect(again.story.Continue()).toBe("Aside.\n");
  });

  test("drops what it carries when the host jumps elsewhere", () => {
    const source = `choose\n  Pick.\n  & print("Aside.")\n  * One\nend\n\nscene other\n  Elsewhere.\nend\n`;
    const ctx = makeStory(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    const saved = ctx.story.state.ToJson();
    ctx.story.ChoosePathString("other");
    expect(ctx.story.Continue()).toBe("Elsewhere.\n");
    const again = makeStory(source);
    again.story.state.LoadJson(saved);
    again.story.ChoosePathString("other");
    expect(again.story.Continue()).toBe("Elsewhere.\n");
  });

  test("keeps what it carries through a host's function call", () => {
    const ctx = makeStory(
      `choose\n  Pick.\n  & print("Aside.")\n  * One\nend\n\nfunction quiet()\n  return 1\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    ctx.story.EvaluateFunction("quiet");
    expect(ctx.story.Continue()).toBe("Aside.\n");
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  test("carries what showed after it through a save", () => {
    const source = `choose\n  Pick.\n  & print("Aside.")\n  * One\nend\n`;
    const ctx = makeStory(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    const saved = ctx.story.state.ToJson();
    const again = makeStory(source);
    again.story.state.LoadJson(saved);
    expect(again.story.Continue()).toBe("Aside.\n");
    expect(again.story.Continue()).toBe("");
    expect(again.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  test("a caption line followed by a call that shows something closes its own line", () => {
    for (const between of [
      `& print("Aside.")`,
      `if true then\n    & print("Aside.")\n  end`,
      `& aside()`,
    ]) {
      const ctx = makeStory(
        `choose\n  Pick.\n  ${between}\n  * One\nend\n\nfunction aside()\n  print("Aside.")\nend\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.Continue()).toBe("Pick.\n");
      expect(ctx.story.currentChoices).toEqual([]);
      expect(ctx.story.Continue()?.trim()).toBe("Aside.");
      expect(ctx.story.Continue()).toBe("");
      expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    }
  });

  test("a caption line followed by a conditional closes its own line", () => {
    const ctx = makeStory(
      `choose\n  Pick.\n  if true then\n    Also.\n  end\n  * One\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    expect(ctx.story.currentChoices).toEqual([]);
  });

  test("only the last display statement before the first choice runs on", () => {
    const ctx = makeStory(
      `choose
  First.
  Pick one.
  * One
end
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("First.\n");
    expect(ctx.story.currentChoices).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick one.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });
});

describe("the compiled program", () => {
  const cases: [string, string, number, number][] = [
    ["a trailing join", `A ..\n.. B\n`, 1, 0],
    ["a touching join", `A..\n..B\n`, 1, 0],
    ["a chain", `A ..\n.. B ..\n.. C\n`, 2, 0],
    ["a join inside a block body", `ALICE:\n  A ..\n  .. B\n`, 0, 0],
    ["a join into an if", `You see a ..\nif true then\n  .. door.\nend\n`, 1, 0],
    ["a join after a divert", `A -> s\n\nscene s\n  B\nend\n`, 0, 1],
    [
      "a chosen line whose flow ends after it",
      `choose\n  * One\n    fin\nend\n`,
      0,
      1,
    ],
    [
      "a chosen line an arrow follows",
      `choose\n  * One -> s\nend\n\nscene s\n  B\nend\n`,
      0,
      1,
    ],
    [
      "an alternator arm whose tail is a divert",
      `A ..\nqueue\n  | .. B -> s\nend\n\nscene s\n  C\nend\n`,
      1,
      1,
    ],
  ];
  for (const [label, source, glue, open] of cases) {
    test(`${label} marks each join \`glue\` or \`open\``, () => {
      const shape = programShape(source);
      expect(shape.glue).toBe(glue);
      expect(shape.open).toBe(open);
      expect(shape.display).toBeGreaterThan(0);
    });
  }

  for (const [label, source] of [
    ["a touching click", `A.. >\n..B\n`],
    ["a spaced click", `A .. >\n.. B\n`],
  ] as const) {
    test(`${label} marks its break \`extend\``, () => {
      const shape = programShape(source);
      expect(shape.glue).toBe(0);
      expect(shape.open).toBe(0);
      expect(shape.extend).toBe(1);
    });
  }

  test("a choose caption is marked `caption`, not `open`", () => {
    const shape = programShape(`choose\n  First.\n  Pick one.\n  * One\nend\n`);
    expect(shape.glue).toBe(0);
    expect(shape.open).toBe(0);
    expect(shape.caption).toBe(1);
  });
});
