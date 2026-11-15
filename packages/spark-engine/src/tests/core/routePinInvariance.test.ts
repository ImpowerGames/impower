import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";
import type {
  PreviewRoute,
  ScriptSource,
} from "../../game/core/types/PreviewRoute";
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
  return { compiler, program: requireChunks(result.program) };
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

const pin = (line: number, offer = 1) => ({ uri: URI, line: line - 1, offer });

function preview(
  lines: string[],
  line: number,
  pins: { uri: string; line: number; offer: number }[],
  counted?: string,
): { route: PreviewRoute; count: unknown } {
  const { compiler, program } = compileSrc(lines.join("\n"));
  const game: any = newGame(program);
  game.setRoutePins?.(pins);
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  expect(game.simulation).toBe("success");
  const source: ScriptSource = {
    lineText: (uri, at) => compiler.documents.get(uri)?.getLineText(at),
    structure: (uri) => compiler.structureOf(uri),
  };
  return {
    route: game.previewRouteOf(game.plannedRoute, source),
    count: counted ? game.story.variablesState[counted] : undefined,
  };
}

const example = [
  "store trust = 0",
  "store clues = 0",
  "",
  "scene start",
  "  INSPECTOR:",
  "    Where were you at nine?",
  "  choose",
  "    * [Tell the truth.]",
  "      trust += 2",
  "    * [Show the photograph.]",
  "      trust += 5",
  "    * [Lie.]",
  "      trust -= 1",
  "  end",
  "  if trust > 3 then",
  "    INSPECTOR:",
  "      I believe you.",
  "    for i = 1, 40000 do",
  "      clues += 1",
  "    end",
  "    You found {clues} clues.",
  "  end",
  "end",
  "",
];

const withoutKinds = (route: PreviewRoute) =>
  route.decisions.map((d) => [
    d.location.range.start.line + 1,
    d.text,
    d.verdict,
    d.passes,
  ]);

const nextJob = () => new Promise((resolve) => setTimeout(resolve, 0));

const pinningEachTakenOptionChangesOnlyItsKind = async (
  lines: string[],
  line: number,
) => {
  const auto = preview(lines, line, [], "clues");
  const taken = auto.route.decisions.filter((d) => d.kind === "auto");
  expect(taken.length).toBeGreaterThan(0);
  for (const choice of taken) {
    const at = choice.location.range.start.line + 1;
    await nextJob();
    const pinned = preview(lines, line, [pin(at, choice.meeting)], "clues");
    expect(pinned.route.decisions.map((d) => d.kind)).toEqual(
      auto.route.decisions.map((d) => (d === choice ? "pinned" : d.kind)),
    );
    expect(withoutKinds(pinned.route)).toEqual(withoutKinds(auto.route));
    expect(pinned.count).toBe(auto.count);
  }
  return auto;
};

describe("pinning an option the route already takes changes only its kind", () => {
  test("the example of #1655 at line 21", async () => {
    const { route, count } = await pinningEachTakenOptionChangesOnlyItsKind(
      example,
      21,
    );
    const loop = route.decisions.at(-1)!;
    expect(loop.kind).toBe("clipped");
    expect(loop.passes).toBe(count);
  }, 120_000);

  test("an option whose sibling runs a long loop", async () => {
    await pinningEachTakenOptionChangesOnlyItsKind(
      [
        "store trust = 0",
        "store clues = 0",
        "store noise = 0",
        "",
        "scene start",
        "  choose",
        "    * [Tell the truth.]",
        "      trust += 2",
        "    * [Lie.]",
        "      for j = 1, 2000 do",
        "        noise += 1",
        "      end",
        "      trust -= 1",
        "  end",
        "  if trust > 3 then",
        "    for i = 1, 40000 do",
        "      clues += 1",
        "    end",
        "    You found {clues} clues.",
        "  end",
        "end",
        "",
      ],
      19,
    );
  }, 120_000);

  test("two menus where a later option avoids the forced verdict", async () => {
    await pinningEachTakenOptionChangesOnlyItsKind(
      [
        "store trust = 0",
        "store clues = 0",
        "scene start",
        "  choose",
        "    * [Tell the truth.]",
        "      trust = 2",
        "    * [Show the photograph.]",
        "      for i = 1, 40000 do",
        "        clues += 1",
        "      end",
        "  end",
        "  choose",
        "    * [Keep the story.]",
        "      trust += 0",
        "    * [Improve the story.]",
        "      trust = 5",
        "      for j = 1, 3000 do",
        "        clues += 1",
        "      end",
        "  end",
        "  if trust > 3 then",
        "    You found {clues} clues.",
        "  end",
        "end",
        "",
      ],
      22,
    );
  }, 120_000);

  test("two menus whose options tie on forced verdicts", async () => {
    await pinningEachTakenOptionChangesOnlyItsKind(
      [
        "store trust = 0",
        "store clues = 0",
        "scene start",
        "  choose",
        "    * [Tell the truth.]",
        "      trust = 2",
        "    * [Lie.]",
        "      trust = -1",
        "      for i = 1, 2000 do",
        "        clues += 1",
        "      end",
        "  end",
        "  choose",
        "    * [Keep the story.]",
        "      trust += 0",
        "    * [Investigate more.]",
        "      for j = 1, 2000 do",
        "        clues += 1",
        "      end",
        "  end",
        "  if trust > 3 then",
        "    for k = 1, 40000 do",
        "      clues += 1",
        "    end",
        "    You found {clues} clues.",
        "  end",
        "end",
        "",
      ],
      25,
    );
  }, 120_000);

  test("an option found before slower siblings stays the route's option when pinned", async () => {
    const lines = ["store total = 0", "scene start", "  choose"];
    lines.push("    * [Winner.]", "      for i = 1, 4000 do", "        total += 1", "      end");
    lines.push("    * [Quick.]", "      total = -1");
    for (let n = 0; n < 8; n += 1) {
      lines.push(
        `    * [Noise ${n}.]`,
        "      for j = 1, 40000 do",
        "        total += 1",
        "      end",
      );
    }
    lines.push("  end", "  Target {total}.", "end", "");
    const line = lines.indexOf("  Target {total}.") + 1;
    const auto = preview(lines, line, [], "total");
    expect(auto.route.decisions.map((d) => d.text)).toEqual(["Winner."]);
    await nextJob();
    const pinned = preview(lines, line, [pin(4)], "total");
    expect(pinned.route.decisions.map((d) => [d.kind, d.text])).toEqual([
      ["pinned", "Winner."],
    ]);
    expect(pinned.count).toBe(auto.count);
  }, 120_000);

  test("a pinned option is followed after a search without the pin reaches its step cap", () => {
    const lines = ["store total = 0", "scene start", "  choose"];
    for (let n = 0; n < 5; n += 1) {
      lines.push(
        `    * [Slow ${n}.]`,
        "      for i = 1, 40000 do",
        "        total += 1",
        "      end",
      );
    }
    lines.push(
      "    * [Quick first.]",
      "      total = 1",
      "    * [Quick pinned.]",
      "      total = 2",
      "  end",
      "  Target total {total}.",
      "end",
      "",
    );
    const line = lines.indexOf("  Target total {total}.") + 1;
    const pinned = preview(
      lines,
      line,
      [pin(lines.indexOf("    * [Quick pinned.]") + 1)],
      "total",
    );
    expect(pinned.route.decisions.map((d) => [d.kind, d.text])).toEqual([
      ["pinned", "Quick pinned."],
    ]);
    expect(pinned.count).toBe(2);
  }, 120_000);

  test("a pin the target cannot be reached through adds no forced verdict to the route that avoids it", () => {
    const lines = [
      "store clues = 0",
      "store gate = true",
      "scene start",
      "  choose",
      "    + [Bypass.]",
      "      clues = 1",
      "    + [Pinned branch.]",
      "      choose",
      "        + [Dead end.]",
      "          -> gone",
      "      end",
      "  end",
      "  if gate then",
      "    choose",
      "      + [Continue.]",
      "        clues += 1",
      "    end",
      "  end",
      "  Target.",
      "end",
      "scene gone",
      "  Gone.",
      "end",
      "",
    ];
    const pinned = preview(lines, 19, [pin(9)], "clues");
    expect(pinned.route.decisions.map((d) => d.kind)).not.toContain("forced");
    expect(pinned.count).toBe(2);
  }, 120_000);

  test("a search that reaches its step ceiling takes the same route with the taken option pinned", async () => {
    const lines = ["store trust = 0", "store clues = 0", "scene start", "  choose"];
    for (let i = 0; i < 7; i += 1) {
      lines.push(
        `    * [Option ${i}.]`,
        "      for i = 1, 40000 do",
        "        clues += 1",
        "      end",
      );
    }
    lines.push(
      "  end",
      "  if trust > 3 then",
      "    for k = 1, 40000 do",
      "      clues += 1",
      "    end",
      "    You found {clues} clues.",
      "  end",
      "end",
      "",
    );
    const target = lines.indexOf("    You found {clues} clues.");
    const { program } = compileSrc(lines.join("\n"));
    const plan = (pins: { uri: string; line: number; offer: number }[]) => {
      const game: any = newGame(program);
      game.setRoutePins(pins);
      game.setStartFrom({ file: URI, line: target });
      const to = game.startAddress;
      return Game.planRoute(game.story, game.program, game.routeStartOf(to), to, {
        maxSteps: 400_000,
        pins: game.pinnedOptions,
      })!;
    };
    const auto = plan([]);
    const taken = auto.choices[0]!;
    const line = lines.indexOf(`    * [${taken.options[taken.selected]}]`) + 1;
    expect(line).toBeGreaterThan(0);
    await nextJob();
    const pinned = plan([pin(line)]);
    expect(pinned.fallback).toBe(auto.fallback);
    expect(pinned.decisions).toEqual(auto.decisions);
    expect(pinned.choices).toEqual(auto.choices);
  }, 120_000);
});
