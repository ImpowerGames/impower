// A `..` joins lines only from the end of a line. The join keeps the spaces
// written before the mark and drops the spaces after it, so `A ..` then `B`
// shows "A B" and `A..` then `B` shows "AB". A `>..` or `> ..` ending a line
// is a break that the next line joins, and the break's table carries `pause`.
// Every join lowers to a display call whose
// table carries `open`, which writes no newline, so no `Glue` object is
// emitted. A line that begins with `..` is an error that names the fix. A
// `choose` block's last caption line leaves its newline pending: its step
// completes with the choices unless the run shows something first.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  displayRouting,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { pathLocation } from "../../compiler/utils/pathLocationTable";

type Routing = { target?: string; character?: string };

const LEADING_GLUE_ERROR =
  "A line cannot begin with `..`. End the previous line with `..` to join them.";

// Each step's text and what `read` reports of it. The text is what its tables
// say joined, since `Continue()` collapses a run of spaces.
function stepsWith<T>(
  story: RuntimeStory,
  read: (story: RuntimeStory) => T,
): [string, T][] {
  const out: [string, T][] = [];
  while (story.canContinue) {
    story.Continue();
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

// Each step's text and the routing of each of its tables.
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

const BASE = "inmemory:///";
const URI = `${BASE}main.sd`;

// Compiles `main.sd` with the other scripts beside it that it includes.
function compile(text: string, others: Record<string, string> = {}) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: Object.entries({ ...others, "main.sd": text }).map(
      ([path, source]) => ({
        uri: `${BASE}${path}`,
        type: "script" as const,
        name: path.replace(/\.sd$/, ""),
        ext: "sd",
        text: source,
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

// The compiled program's tokens, flattened, with every nested container
// visited.
function tokens(json: unknown): unknown[] {
  const out: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === "object") {
      out.push(value);
      for (const item of Object.values(value)) visit(item);
    } else {
      out.push(value);
    }
  };
  visit(json);
  return out;
}

// What the compiled program holds: its `Glue` objects, its `line` markers,
// its `display` calls, and how many of those tables carry `open` or `caption`.
function programShape(text: string) {
  const ctx = makeRuntimeStoryFromSource(text);
  expect(ctx.errorMessages).toEqual([]);
  const all = tokens(ctx.compiledJson);
  return {
    glue: all.filter((t) => t === "<>").length,
    line: all.filter((t) => t === "line").length,
    display: all.filter((t) => t === "stdlib:display:1").length,
    open: all.filter((t) => t === "^open").length,
    caption: all.filter((t) => t === "^caption").length,
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

// Each trailing form and the joined text it shows.
const SPACINGS: { first: string; joined: string }[] = [
  { first: "A ..", joined: "A B\n" },
  { first: "A   ..", joined: "A   B\n" },
  { first: "A..", joined: "AB\n" },
  { first: "A ..   ", joined: "A B\n" },
];

describe("a trailing `..` joins the next line", () => {
  for (const { label, inline, block, routing } of TYPES) {
    for (const { first, joined } of SPACINGS) {
      test(`${label}: ${JSON.stringify(first)} then B`, () => {
        const ctx = makeRuntimeStoryFromSource(
          `${inline}${first}\n${inline}B\n`,
        );
        expect(ctx.errorMessages).toEqual([]);
        expect(steps(ctx.story)).toEqual([[joined, [routing, {}]]]);
      });

      test(`${label} block: ${JSON.stringify(first)} then B`, () => {
        const ctx = makeRuntimeStoryFromSource(
          `${block}\n  ${first}\n  B\n`,
        );
        expect(ctx.errorMessages).toEqual([]);
        expect(steps(ctx.story)).toEqual([[joined, [routing]]]);
      });
    }

    test(`${label}: a chain of three`, () => {
      const ctx = makeRuntimeStoryFromSource(
        `${inline}a ..\n${inline}b..\n${inline}c.\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(steps(ctx.story)).toEqual([["a bc.\n", [routing, {}, {}]]]);
    });

    test(`${label}: a join into each branch of an if`, () => {
      for (const [value, word] of [
        ["true", "door."],
        ["false", "wall."],
      ]) {
        const ctx = makeRuntimeStoryFromSource(
          `store c = ${value}\n${inline}You see a ..\nif c then\n  door.\nelse\n  wall.\nend\n`,
        );
        expect(ctx.errorMessages).toEqual([]);
        expect(texts(ctx.story)).toEqual([`You see a ${word}\n`]);
      }
    });

    test(`${label}: a branch's first line keeps the routing of the line it joins`, () => {
      for (const block of [
        `if true then\n  B > C\nend`,
        `if false then\n  X.\nelseif true then\n  B > C\nend`,
        `if false then\n  X.\nelse\n  B > C\nend`,
        `if true then\n  if true then\n    B > C\n  end\nend`,
        `queue\n  | B > C\nend`,
      ]) {
        const ctx = makeRuntimeStoryFromSource(`${inline}A ..\n${block}\n`);
        expect(ctx.errorMessages).toEqual([]);
        expect(steps(ctx.story)).toEqual([
          ["A B\n", [routing, {}]],
          ["C\n", [routing]],
        ]);
      }
    });

    test(`${label}: a join after a divert`, () => {
      const ctx = makeRuntimeStoryFromSource(
        `${inline}You go -> outdoors\n\nscene outdoors\n  outside.\nend\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual(["You go outside.\n"]);
    });
  }

  test("an interpolation line that ends with `..`", () => {
    const ctx = makeRuntimeStoryFromSource(
      `store n = 3\nYou have ..\n{n} ..\ncoins.\nAfter.\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(texts(ctx.story)).toEqual(["You have 3 coins.\n", "After.\n"]);
  });

  test("an interpolation line that ends with marks and a tag or comment", () => {
    for (const [source, joined, pause] of [
      [`{3} .. # tag\nB\n`, "3 B\n", false],
      [`{3} .. // note\nB\n`, "3 B\n", false],
      [`{3} >..\nB\n`, "3B\n", true],
      [`{3} > ..\nB\n`, "3 B\n", true],
      [`{3} >.. # tag\nB\n`, "3B\n", true],
    ] as const) {
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual([joined]);
      const again = makeRuntimeStoryFromSource(source);
      again.story.Continue();
      expect(flags(again.story, "pause")).toEqual([pause, false]);
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
          ["B\n", [true, false]],
          ["After.\n", [false]],
        ],
      ],
    ] as const) {
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(
        stepsWith(ctx.story, (story) => flags(story, "pause")),
      ).toEqual(expected);
    }
  });

  test("a `..` after an interpolation in the middle of a line is text", () => {
    for (const [source, rest] of [
      [`{3} .. and more.\n`, ".. and more.\n"],
      [`{3}..and more.\n`, "..and more.\n"],
    ] as const) {
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.errorMessages).toEqual([]);
      // The grammar makes the interpolation and the rest of its line two
      // statements, as it does for `{3} and more.`.
      expect(texts(ctx.story)).toEqual(["3\n", rest]);
    }
  });

  test("a `>` that touches the word before a line-ending `..` is text and warned", () => {
    const ctx = makeRuntimeStoryFromSource(`Abso>..\nlutely.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toEqual([
      "This `>` touches the word before it, so it is text, not a break. Put a space before it to click here and then join the next line.",
    ]);
    expect(texts(ctx.story)).toEqual(["Abso>lutely.\n"]);
    const inBlock = makeRuntimeStoryFromSource(
      `:\n  Abso>..\n  lutely.\n  Next.\n`,
    );
    expect(inBlock.warningMessages).toEqual(ctx.warningMessages);
    for (const quiet of [`Abso >..\nlutely.\n`, `A\\>..\nB\n`]) {
      expect(makeRuntimeStoryFromSource(quiet).warningMessages).toEqual([]);
    }
  });

  test("a tag after the mark on a block's last line keeps the join", () => {
    for (const [first, joined] of [
      ["A .. # marker", "A B\n"],
      ["A >.. # marker", "AB\n"],
    ] as const) {
      const ctx = makeRuntimeStoryFromSource(`ALICE:\n  ${first}\nB\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual([joined]);
    }
  });

  test("a tag or comment after the mark keeps the next line a continuation", () => {
    for (const source of [
      `HERO: A .. # note\nB > C\n`,
      `HERO: A .. // note\nB > C\n`,
      `A .. # note\nB\n`,
    ]) {
      const ctx = makeRuntimeStoryFromSource(source);
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
      const ctx = makeRuntimeStoryFromSource(
        `${block}\n  Hello .. # marker\n  world.\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(texts(ctx.story)).toEqual(["Hello world.\n"]);
    }
  });

  test("a tag or comment after `>..` keeps the break", () => {
    for (const source of [`A >.. # tag\nB\n`, `A >.. // note\nB\n`]) {
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.errorMessages).toEqual([]);
      ctx.story.Continue();
      expect(flags(ctx.story, "pause")).toEqual([true, false]);
      const again = makeRuntimeStoryFromSource(source);
      expect(texts(again.story)).toEqual(["AB\n"]);
    }
  });

  test("a `load` line after a line that ends with `..` stays a directive", () => {
    const ctx = makeRuntimeStoryFromSource(`A ..\nload overworld\nB\n`);
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(
      ctx.story.currentDisplayInstructions.map(
        (table) =>
          (table.value?.get("load") as { value?: unknown } | undefined)?.value,
      ),
    ).toEqual([undefined, "overworld"]);
    expect(texts(ctx.story)).toEqual(["B\n"]);
  });

  test("an ellipsis and a mid-line `..` stay text", () => {
    const ctx = makeRuntimeStoryFromSource(`Wait...\na..b\nHi ...\nB\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(texts(ctx.story)).toEqual(["Wait...\n", "a..b\n", "Hi ...\n", "B\n"]);
  });
});

describe("a `>..` ending a line is a break the next line joins", () => {
  for (const [first, joined] of [
    ["A >..", "AB\n"],
    ["A > ..", "A B\n"],
    ["Abso >..", "Absolutely.\n"],
  ] as const) {
    test(JSON.stringify(first), () => {
      const second = first.startsWith("Abso") ? "lutely." : "B";
      const ctx = makeRuntimeStoryFromSource(`${first}\n${second}\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.Continue()).toBe(joined);
      expect(flags(ctx.story, "pause")).toEqual([true, false]);
      expect(ctx.story.canContinue).toBe(false);
    });
  }
});

describe("a line that begins with `..` is an error", () => {
  test("a line that begins with `..`", () => {
    const source = `A\n.. B\n`;
    expect(errorsOf(source)).toEqual([
      {
        message: LEADING_GLUE_ERROR,
        start: { line: 1, character: 0 },
        end: { line: 1, character: 2 },
      },
    ]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(texts(ctx.story)).toEqual(["A\n", "B\n"]);
  });

  test("a line that begins with a touching `..`", () => {
    for (const source of [`A\n..B\n`, `ALICE:\n  A\n  ..B\n`]) {
      const inBlock = source.startsWith("ALICE:");
      const line = inBlock ? 2 : 1;
      const character = inBlock ? 2 : 0;
      expect(errorsOf(source)).toEqual([
        {
          message: LEADING_GLUE_ERROR,
          start: { line, character },
          end: { line, character: character + 2 },
        },
      ]);
    }
    const ctx = makeRuntimeStoryFromSource(`A\n..B\n...and then.\n`);
    expect(texts(ctx.story)).toEqual(["A\n", "B\n", "...and then.\n"]);
  });

  test("a bare `..` line", () => {
    const source = `A\n  ..\nB\n`;
    expect(errorsOf(source)).toEqual([
      {
        message: LEADING_GLUE_ERROR,
        start: { line: 1, character: 2 },
        end: { line: 1, character: 4 },
      },
    ]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(texts(ctx.story)).toEqual(["A\n", "B\n"]);
  });

  test("a block body line that begins with `..`", () => {
    const source = `ALICE:\n  A\n  .. B\n`;
    expect(errorsOf(source)).toEqual([
      {
        message: LEADING_GLUE_ERROR,
        start: { line: 2, character: 2 },
        end: { line: 2, character: 4 },
      },
    ]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(texts(ctx.story)).toEqual(["A\nB\n"]);
  });
});

describe("a `load` line that ends with `..`", () => {
  test("is an error and joins nothing", () => {
    const source = `load overworld ..\nUnderworld.\n`;
    expect(errorsOf(source)).toEqual([
      {
        message:
          "A `load` line cannot end with `..`. Name every asset it loads on the line.",
        start: { line: 0, character: 15 },
        end: { line: 0, character: 17 },
      },
    ]);
    const ctx = makeRuntimeStoryFromSource(source);
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
    const ctx = makeRuntimeStoryFromSource(
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

  // An external call is not safe to run ahead of a line's newline, so without
  // the caption running on, the caption would complete a step of its own and
  // the choices would come from the next continue.
  test("runs through an external call to its choices", () => {
    const ctx = makeRuntimeStoryFromSource(
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
    const ctx = makeRuntimeStoryFromSource(
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

  test("runs through an external an included script declares", () => {
    const program = compile(
      `include api.sd\n\nchoose\n  Pick.\n  & ring()\n  * One\nend\n`,
      { "api.sd": `external ring()\n` },
    );
    expect(errorsIn(program)).toEqual([]);
    const story = new RuntimeStory(program.compiled as Record<string, any>);
    let rings = 0;
    story.BindExternalFunction("ring", () => {
      rings++;
    });
    expect(story.Continue()).toBe("Pick.");
    expect(story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    expect(rings).toBe(1);
  });

  test("closes its line before a function an included script defines", () => {
    const program = compile(
      `include api.sd\n\nchoose\n  Pick.\n  & aside()\n  * One\nend\n`,
      { "api.sd": `function aside()\n  print("Aside.")\nend\n` },
    );
    expect(errorsIn(program)).toEqual([]);
    const story = new RuntimeStory(program.compiled as Record<string, any>);
    expect(story.Continue()).toBe("Pick.\n");
  });

  test("runs through a pure stdlib call", () => {
    const ctx = makeRuntimeStoryFromSource(
      `store x = -2\nchoose\n  Pick.\n  & x = math.abs(x)\n  * One\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    expect(ctx.story.variablesState.$("x")).toBe(2);
  });

  // `pcall` runs its function against an output stream of its own and drops
  // what it printed, so a `print` inside one shows nothing.
  test("runs through calls that show nothing on this run", () => {
    for (const between of [
      `& assert(true)`,
      `& quiet()`,
      `& pcall(aside)`,
      `if false then\n    Also.\n  end`,
    ]) {
      const ctx = makeRuntimeStoryFromSource(
        `choose\n  Pick.\n  ${between}\n  * One\nend\n\nfunction quiet()\n  local x = 1\nend\n\nfunction aside()\n  print("Aside.")\nend\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.Continue()).toBe("Pick.");
      expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    }
  });

  test("runs through to a first choice inside a conditional", () => {
    const ctx = makeRuntimeStoryFromSource(
      `choose\n  Pick.\n  if true then\n    * One\n  end\n  * Two\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One", "Two"]);
  });

  test("ends its step where something shows, and the next continue starts with it", () => {
    const ctx = makeRuntimeStoryFromSource(
      `choose\n  Pick.\n  & aside()\n  * One\nend\n\nfunction aside()\n  print("Aside.")\n  print("More.")\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    expect(ctx.story.currentChoices).toEqual([]);
    expect(ctx.story.Continue()).toBe("Aside.\n");
    // A function's output ends without its trailing newline.
    expect(ctx.story.Continue()).toBe("More.");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  // The step that shows something after the caption runs in the caption's
  // continue, once: its output is carried, not produced again by the next.
  test("runs the step that shows after it once, before the next continue", () => {
    const source = `store count = 0\nchoose\n  Pick.\n  & aside()\n  * One\nend\n\nfunction aside()\n  count = count + 1\n  print("Aside.")\nend\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    expect(ctx.story.variablesState.$("count")).toBe(1);
    const saved = ctx.story.state.ToJson();
    expect(ctx.story.Continue()?.trim()).toBe("Aside.");
    expect(ctx.story.variablesState.$("count")).toBe(1);
    const again = makeRuntimeStoryFromSource(source);
    again.story.state.LoadJson(saved);
    expect(again.story.Continue()?.trim()).toBe("Aside.");
    expect(again.story.variablesState.$("count")).toBe(1);
    expect(again.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  // A caption the carried step shows keeps its own newline waiting, through a
  // save too.
  test("carries a caption's own waiting line end", () => {
    const source = `choose\n  Outer.\n  if true then\n    choose\n      Inner.\n      & print("Aside.")\n      * Inner choice\n    end\n  end\n  * Outer choice\nend\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(texts(ctx.story)).toEqual(["Outer.\n", "Inner.\n", "Aside.\n"]);
    const first = makeRuntimeStoryFromSource(source);
    expect(first.story.Continue()).toBe("Outer.\n");
    const again = makeRuntimeStoryFromSource(source);
    again.story.state.LoadJson(first.story.state.ToJson());
    expect(again.story.Continue()).toBe("Inner.\n");
    expect(again.story.Continue()).toBe("Aside.\n");
  });

  test("drops what it carries when the host jumps elsewhere", () => {
    const source = `choose\n  Pick.\n  & print("Aside.")\n  * One\nend\n\nscene other\n  Elsewhere.\nend\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    const saved = ctx.story.state.ToJson();
    ctx.story.ChoosePathString("other");
    expect(ctx.story.Continue()).toBe("Elsewhere.\n");
    const again = makeRuntimeStoryFromSource(source);
    again.story.state.LoadJson(saved);
    again.story.ChoosePathString("other");
    expect(again.story.Continue()).toBe("Elsewhere.\n");
  });

  // What the preview credits a line to: the continue that shows it. The line
  // that shows after the caption ran in the caption's continue, and is
  // reported in the next one, which shows it.
  test("reports the lines the carried step ran in the continue that shows them", () => {
    const source = `choose\n  Pick.\n  if true then\n    Something shows first.\n  end\n  * One\nend\n`;
    const program = compile(source) as any;
    expect(errorsIn(program)).toEqual([]);
    const story = new RuntimeStory(program.compiled as Record<string, any>);
    const line = source
      .split("\n")
      .findIndex((l) => l.includes("Something shows first."));
    let ran = new Set<number>();
    story.onExecute = (path) => {
      const location = pathLocation(program.pathLocations, path);
      if (location) ran.add(location[1]!);
    };
    expect(story.Continue()).toBe("Pick.\n");
    expect(ran.has(line)).toBe(false);
    ran = new Set();
    expect(story.Continue()).toBe("Something shows first.\n");
    expect(ran.has(line)).toBe(true);
  });

  test("keeps what it carries through a host's function call", () => {
    const ctx = makeRuntimeStoryFromSource(
      `choose\n  Pick.\n  & print("Aside.")\n  * One\nend\n\nfunction quiet()\n  return 1\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    ctx.story.EvaluateFunction("quiet");
    expect(ctx.story.Continue()).toBe("Aside.\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  test("carries what showed after it through a save", () => {
    const source = `choose\n  Pick.\n  & print("Aside.")\n  * One\nend\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    const saved = ctx.story.state.ToJson();
    const again = makeRuntimeStoryFromSource(source);
    again.story.state.LoadJson(saved);
    expect(again.story.Continue()).toBe("Aside.\n");
    expect(again.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
  });

  test("a caption line followed by a call that shows something closes its own line", () => {
    for (const between of [
      `& print("Aside.")`,
      `if true then\n    & print("Aside.")\n  end`,
      `& aside()`,
    ]) {
      const ctx = makeRuntimeStoryFromSource(
        `choose\n  Pick.\n  ${between}\n  * One\nend\n\nfunction aside()\n  print("Aside.")\nend\n`,
      );
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.Continue()).toBe("Pick.\n");
      expect(ctx.story.currentChoices).toEqual([]);
      // A function's output ends without its trailing newline, so `aside()`
      // shows "Aside." where the direct `print` shows "Aside.\n".
      expect(ctx.story.Continue()?.trim()).toBe("Aside.");
      expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["One"]);
    }
  });

  test("a caption line followed by a conditional closes its own line", () => {
    const ctx = makeRuntimeStoryFromSource(
      `choose\n  Pick.\n  if true then\n    Also.\n  end\n  * One\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick.\n");
    expect(ctx.story.currentChoices).toEqual([]);
  });

  test("only the last display statement before the first choice runs on", () => {
    const ctx = makeRuntimeStoryFromSource(
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
  const cases: [string, string, number][] = [
    ["a trailing join", `A ..\nB\n`, 1],
    ["a touching join", `A..\nB\n`, 1],
    ["a chain", `A ..\nB ..\nC\n`, 2],
    ["a join inside a block body", `ALICE:\n  A ..\n  B\n`, 0],
    ["a touching click", `A >..\nB\n`, 1],
    ["a spaced click", `A > ..\nB\n`, 1],
    ["a join into an if", `You see a ..\nif true then\n  door.\nend\n`, 1],
    ["a join after a divert", `A -> s\n\nscene s\n  B\nend\n`, 1],
    [
      "a chosen line whose flow ends after it",
      `choose\n  * One\n    fin\nend\n`,
      1,
    ],
    [
      "a chosen line an arrow follows",
      `choose\n  * One -> s\nend\n\nscene s\n  B\nend\n`,
      1,
    ],
    [
      "an alternator arm whose tail is a divert",
      `A ..\nqueue\n  | B -> s\nend\n\nscene s\n  C\nend\n`,
      2,
    ],
  ];
  for (const [label, source, open] of cases) {
    test(`${label} emits no Glue and marks every join \`open\``, () => {
      const shape = programShape(source);
      expect(shape.glue).toBe(0);
      expect(shape.open).toBe(open);
      expect(shape.line).toBe(shape.display);
    });
  }

  test("a choose caption is marked `caption`, not `open`", () => {
    const shape = programShape(`choose\n  First.\n  Pick one.\n  * One\nend\n`);
    expect(shape.glue).toBe(0);
    expect(shape.open).toBe(0);
    expect(shape.caption).toBe(1);
  });
});
