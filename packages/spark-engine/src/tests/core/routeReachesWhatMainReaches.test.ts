// #637 — every line origin/main's preview reaches is reached, showing either
// the value the program's own run gives or, where the search that follows the
// program falls back (`planRoute`), the value origin/main's route gives. A
// route that forces a loop's exit at its first test, because the routes that
// run the loop's menus spend the search's levels first, shows origin/main's
// value too: origin/main's route leaves every such loop there.
//
// The scripts are the ones the reviews of #637 raised, with the loops of menus
// that fall back in a long scene. origin/main's preview is the same preview
// with the faithful search given no budget, which leaves every route to
// origin/main's search, copied unchanged (`planRouteFallback`).

import { afterEach, describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { faithfulBudget } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";

const URI = "inmemory:///main.sd";

function compileSrc(src: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: src,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const result = compiler.compile({ textDocument: { uri: URI } });
  return requireChunks(result.program);
}

const newGame = (program: unknown) =>
  new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

const budget = { ...faithfulBudget };
afterEach(() => {
  Object.assign(faithfulBudget, budget);
});

/** Preview the line holding `label` from the top: whether the replay reached
 *  it, the value of `store` it shows, and whether its route fell back. */
function preview(
  program: unknown,
  lines: string[],
  label: string,
  store: string,
) {
  const game: any = newGame(program);
  game.setStartFrom({
    file: URI,
    line: lines.findIndex((l) => l.includes(label)),
  });
  game.simulate();
  return {
    reached: game.simulation === "success",
    value: game.story.variablesState[store],
    fellBack: game.plannedRoute?.fallback === true,
  };
}

const scene = (...body: string[]) => [
  "-> start",
  "scene start",
  ...body,
  "end",
  "",
];

const menuLoop = (passes: number) => [
  "store flag = false",
  "store total = 0",
  ...scene(
    `  for i = 1, ${passes} do`,
    "    choose",
    "    + [Left]",
    "      & total += 1",
    "    + [Right]",
    "      & total += 2",
    "    end",
    "  end",
    "  Middle beat.",
    "  if flag then",
    "    Target {total}.",
    "  end",
  ),
];

const menusAfterLoop = (menus: number) => {
  const body = ["  for i = 1, 3 do", "    total += i", "  end"];
  for (let m = 0; m < menus; m += 1) {
    body.push(
      "  choose",
      `  + [Left ${m}]`,
      "    & path = path * 2 + 1",
      `  + [Right ${m}]`,
      "    & path = path * 2 + 2",
      "  end",
    );
  }
  body.push("  Target total {total}.");
  return ["store total = 0", "store path = 0", ...scene(...body)];
};

const menusAfterSkippedBranch = (menus: number) => {
  const body = ["  if flag then", "    Target branch {total}.", "  end"];
  for (let m = 0; m < menus; m += 1) {
    body.push(
      "  choose",
      `  + [Left ${m}]`,
      "    & total += 1",
      `  + [Right ${m}]`,
      "    & total += 2",
      "  then",
      `    Menu ${m} done.`,
      "  end",
    );
  }
  return ["store flag = false", "store total = 0", ...scene(...body)];
};

const loopWithBranch = (passes: number) => [
  "store flag = false",
  "store total = 0",
  ...scene(
    `  for i = 1, ${passes} do`,
    "    if i % 3 == 0 then",
    "      total += 1",
    "    end",
    "  end",
    "  if flag then",
    "    Target total {total}.",
    "  end",
  ),
];

/** [name, script, label of the previewed line, store it shows, the value
 *  it shows: the program's own, or origin/main's ("main")] */
const CASES: [string, string[], string, string, number | "main"][] = [
  [
    "a while loop inside a called function",
    [
      "store total = 0",
      ...scene("  & g()", "  Target total {total}."),
      "function g()",
      "  local n = 0",
      "  while n < 2 do",
      "    n = n + 1",
      "    total = total + n",
      "  end",
      "end",
      "",
    ],
    "Target total",
    "total",
    3,
  ],
  [
    "a loop of 600 menus",
    [
      "store total = 0",
      ...scene(
        "  for i = 1, 600 do",
        "    choose",
        "    + [Continue]",
        "      & total += 1",
        "    end",
        "  end",
        "  Target total {total}.",
      ),
    ],
    "Target total",
    "total",
    600,
  ],
  [
    "a loop of 40,000 passes with no beat",
    [
      "store total = 0",
      ...scene(
        "  for i = 1, 40000 do",
        "    total += 1",
        "  end",
        "  Target total {total}.",
      ),
    ],
    "Target total",
    "total",
    85,
  ],
  [
    "a menu that can repeat forever",
    [
      "store total = 0",
      ...scene(
        "  choose",
        "  + [Again]",
        "    -> start",
        "  + [Leave]",
        "    Leaving.",
        "  end",
        "  Target total {total}.",
      ),
    ],
    "Target total",
    "total",
    0,
  ],
  [
    "a long call before the first condition",
    [
      "store total = 0",
      ...scene(
        "  & table.foreachi(table.create(150000, 1), function(k, v) total += v end)",
        "  if total > 0 then",
        "    Target total {total}.",
        "  end",
      ),
    ],
    "Target total",
    "total",
    150000,
  ],
  [
    "a skipped branch before a long loop",
    [
      "store flag = false",
      "store total = 0",
      ...scene(
        "  if flag then",
        "    Inside the branch {total}.",
        "  end",
        "  for i = 1, 400000 do",
        "    total += 1",
        "  end",
        "  After the loop.",
      ),
    ],
    "Inside the branch",
    "total",
    0,
  ],
  [
    "a skipped branch beside a loop of heavy calls that never ends",
    [
      "store flag = false",
      "store total = 0",
      ...scene(
        "  if flag then",
        "    Target branch {total}.",
        "  else",
        "    while true do",
        "      & table.foreachi(table.create(10000, 1), function(k, v) total += v end)",
        "    end",
        "  end",
      ),
    ],
    "Target branch",
    "total",
    0,
  ],
  [
    "a loop inside a forced branch",
    [
      "store flag = false",
      "store total = 0",
      ...scene(
        "  if flag then",
        "    for i = 1, 3 do",
        "      total += i",
        "    end",
        "    Target total {total}.",
        "  end",
      ),
    ],
    "Target total",
    "total",
    6,
  ],
  [
    "a loop that never ends inside a branch after the line's",
    [
      "store flag = false",
      "store other = false",
      "store laps = 0",
      "store total = 0",
      ...scene(
        "  if other then",
        "    Target total {total}.",
        "  end",
        "  if flag then",
        "    while true do",
        "      laps += 1",
        "    end",
        "  end",
      ),
    ],
    "Target total",
    "total",
    0,
  ],
  [
    "nested forced branches before a loop that never ends",
    [
      "store flag = false",
      "store a = false",
      "store b = false",
      "store laps = 0",
      "store total = 0",
      ...scene(
        "  if a then",
        "    if b then",
        "      Target total {total}.",
        "    end",
        "  end",
        "  if flag then",
        "    while true do",
        "      laps += 1",
        "      if laps % 2 == 0 then",
        "        total += 1",
        "      end",
        "    end",
        "  end",
      ),
    ],
    "Target total",
    "total",
    0,
  ],
  [
    "a loop of 5,000 passes with a branch in it",
    loopWithBranch(5000),
    "Target total",
    "total",
    22,
  ],
  [
    "a loop of 60,000 passes with a branch in it",
    loopWithBranch(60000),
    "Target total",
    "total",
    22,
  ],
  [
    "an assertion that holds on one choice only",
    [
      "store total = 0",
      ...scene(
        "  choose",
        "  + [Safe]",
        "    & total = 1",
        "  + [Unsafe]",
        "    & total = 2",
        "  end",
        "  if false then",
        "    & assert(total == 1, 'safe only')",
        "    Target {total}.",
        "  end",
      ),
    ],
    "Target",
    "total",
    1,
  ],
  [
    "a condition that holds on one choice only",
    [
      "store total = 0",
      ...scene(
        "  choose",
        "  + [Safe]",
        "    & total = 1",
        "  + [Unsafe]",
        "    & total = 2",
        "  end",
        "  if false then",
        "    if total == 1 then",
        "      Target {total}.",
        "    end",
        "  end",
      ),
    ],
    "Target",
    "total",
    1,
  ],
  [
    "an assertion that holds on one pass's choice only",
    [
      "store total = 0",
      "store path = 0",
      ...scene(
        "  for i = 1, 3 do",
        "    choose",
        "    + [A]",
        "      & path = 1",
        "    + [B]",
        "      & path = 2",
        "    end",
        "    if false then",
        "      & assert(path == 1 and i == 2, 'A on pass 2 only')",
        "      Target {total} {path}.",
        "    end",
        "    total += i",
        "  end",
      ),
    ],
    "Target",
    "total",
    1,
  ],
  [
    "a break inside a loop",
    [
      "store total = 0",
      ...scene(
        "  for i = 1, 3 do",
        "    if i == 3 then",
        "      break",
        "    end",
        "    total += i",
        "  end",
        "  Target {total}.",
      ),
    ],
    "Target",
    "total",
    3,
  ],
  [
    "a branch around a loop",
    [
      "store total = 0",
      "store go = true",
      ...scene(
        "  if go then",
        "    for i = 1, 3 do",
        "      total += i",
        "    end",
        "  end",
        "  Target {total}.",
      ),
    ],
    "Target",
    "total",
    6,
  ],
  [
    "a loop in a choose block's preamble",
    [
      "store total = 0",
      ...scene(
        "  choose",
        "    for i = 1, 3 do",
        "      total += i",
        "      + Pick {i}",
        "    end",
        "  end",
        "  Target {total}.",
      ),
    ],
    "Target",
    "total",
    6,
  ],
  [
    "menus inside a condition after a loop",
    [
      "store total = 0",
      ...scene(
        "  for i = 1, 3 do",
        "    total += i",
        "  end",
        "  Middle beat.",
        "  Another middle beat.",
        "  if total > 0 then",
        "    choose",
        "    + [Only 0]",
        "      Picked.",
        "    end",
        "    choose",
        "    + [Only 1]",
        "      Picked.",
        "    end",
        "  end",
        "  Target total {total}.",
      ),
    ],
    "Target total",
    "total",
    6,
  ],
  ["eight menus after a loop", menusAfterLoop(8), "Target total", "total", 6],
  [
    "twelve menus after a loop",
    menusAfterLoop(12),
    "Target total",
    "total",
    "main",
  ],
  [
    "six menus after a skipped branch",
    menusAfterSkippedBranch(6),
    "Target branch",
    "total",
    0,
  ],
  [
    "a loop of 10 menus before a skipped branch",
    menuLoop(10),
    "Target",
    "total",
    18,
  ],
  [
    "a loop of 20 menus before a skipped branch",
    menuLoop(20),
    "Target",
    "total",
    "main",
  ],
  [
    "a loop of 40 menus before a skipped branch",
    menuLoop(40),
    "Target",
    "total",
    "main",
  ],
];

describe("a preview reaches every line origin/main's preview reaches", () => {
  test.each(CASES)(
    "%s",
    (_name, lines, label, store, shows) => {
      const program = compileSrc(lines.join("\n"));
      faithfulBudget.nodes = 0;
      const main = preview(program, lines, label, store);
      Object.assign(faithfulBudget, budget);
      const head = preview(program, lines, label, store);
      if (main.reached) {
        expect(head.reached).toBe(true);
      }
      if (head.fellBack) {
        expect(shows).toBe("main");
      }
      expect(head.value).toEqual(shows === "main" ? main.value : shows);
    },
    300_000,
  );

  test("a route that falls back orders a choice's condition as origin/main's search does", () => {
    // Twelve menus spend the search that follows the program, so the line is
    // reached by origin/main's search, which tries a choice's condition true
    // first and skips the loop: origin/main's preview shows 1, where the
    // program, which can only take Available, shows 62.
    const menus: string[] = [];
    for (let m = 0; m < 12; m += 1) {
      menus.push(
        "  choose",
        `  + [Left ${m}]`,
        "    & path = path * 2 + 1",
        `  + [Right ${m}]`,
        "    & path = path * 2 + 2",
        "  end",
      );
    }
    const lines = [
      "store total = 0",
      "store pick = 0",
      "store path = 0",
      ...scene(
        "  for i = 1, 3 do",
        "    total += i",
        "  end",
        "  choose",
        "  + if false [Unavailable]",
        "    & pick = 1",
        "  + [Available]",
        "    & pick = 2",
        "  end",
        ...menus,
        "  total = total * 10 + pick",
        "  Target {total}.",
      ),
    ];
    const head = preview(
      compileSrc(lines.join("\n")),
      lines,
      "Target",
      "total",
    );
    expect(head).toEqual({ reached: true, value: 1, fellBack: true });
  }, 300_000);
});
