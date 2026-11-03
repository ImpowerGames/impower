import { describe, expect, it } from "vitest";
import { Game } from "../../game/core/classes/Game";
import { GameSavedSceneEntryMessage } from "../../game/core/classes/messages/GameSavedSceneEntryMessage";
import type { GameSave, SaveSource } from "../../game/core/types/GameSave";
import { flowScopeOwners } from "@impower/sparkdown/src/program/ProgramStoryState";
import { savedParameterOf, type SavedFrame } from "@impower/sparkdown/src/program/saveValueSet";
import { formatLiteral } from "@impower/sparkdown/src/program/startingValueLiterals";
import { literalOfValue, parametersOf } from "@impower/sparkdown/src/program/startingValues";
import {
  compileSrc,
  example,
  recompile,
  URI,
} from "../harness/startingValuesGame";

const playGame = (program: unknown, compiler?: any) => {
  const game: any = new Game({
    program: program as any,
    saveHistory: 1,
    savesSceneEntries: true,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
  if (compiler) {
    game.scriptLineText = (uri: string, at: number) =>
      compiler.documents.get(uri)?.getLineText(at);
  }
  return game;
};

const playFromLine = (
  program: unknown,
  compiler: any,
  line: number,
  onSceneSave?: (save: GameSave) => void,
) => {
  const game = playGame(program, compiler);
  game.connection.connectOutput((message: any) => {
    if (message.method === GameSavedSceneEntryMessage.method) {
      onSceneSave?.(message.params.save);
    }
  });
  game.setStartingValues({});
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  expect(game.simulation).toBe("success");
  game.start();
  return game;
};

const START_LINE = example.indexOf('  -> interrogation("nine")') + 1;

const shownText = (game: any): string =>
  Object.values(game._shownBeatOnScreen?.text ?? {})
    .flat()
    .map((event: any) => event.text ?? "")
    .join("");

const advanceTo = (game: any, text: string) => {
  for (let i = 0; i < 20 && !shownText(game).includes(text); i++) {
    if (game.story.currentChoices.length > 0) {
      game.chosePathToContinue(0);
    } else {
      game.clickedToContinue();
    }
  }
  expect(shownText(game)).toContain(text);
};

const choose = (game: any, text: string) => {
  const index = game.story.currentChoices.findIndex((c: any) =>
    c.text.includes(text),
  );
  expect(index).toBeGreaterThanOrEqual(0);
  game.chosePathToContinue(index);
};

const resumed = (program: unknown, data: string) => {
  const game = playGame(program);
  expect(game.loadToResume(data)).toBe(true);
  game.start();
  return game;
};

const engineLiteral = (value: unknown): string | undefined => {
  const literal = value == null ? undefined : literalOfValue(value as any);
  return literal === undefined ? undefined : formatLiteral(literal);
};

const expectEngineParameters = (game: any, program: unknown, save: GameSave) => {
  const root = game.story.root;
  const engine = playGame(program);
  expect(engine.loadToResume(save.data)).toBe(true);
  const state = engine.story.state;
  const elements = state.callStack.currentThread.callstack;
  const flowsAt = elements.map((_: unknown, i: number) => {
    const position = i === elements.length - 1 ? state.position : state.frameOf(elements[i + 1])?.returnTo;
    return position
      ? flowScopeOwners(root, position.sequence).map((symbol) => root.table.symbols[symbol])
      : [];
  });
  const parameters = (flow: string): string[] => parametersOf(root, flow);
  const engineValue = (i: number, j: number, name: string): string | undefined =>
    elements[i].temporaryScopes[j + 1]?.has(name)
      ? engineLiteral(state.variablesState.GetVariableWithName(name, i + 1, j + 1))
      : undefined;
  const expected = new Map<string, [string, string, string | undefined]>();
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    (flowsAt[i] as string[]).forEach((flow, j) => {
      for (const name of parameters(flow)) {
        const id = `${flow} ${name}`;
        if (expected.get(id)?.[2] !== undefined) {
          continue;
        }
        expected.set(id, [flow, name, engineValue(i, j, name)]);
      }
    });
  }
  const sources: SaveSource[] = save.entry ? [{ data: save.data }, save] : [{ data: save.data }];
  for (const source of sources) {
    const frames: SavedFrame[] = game.saveListing(source, save.scene).values.frames;
    expect(frames.map((frame) => frame.scopeFlows)).toEqual(flowsAt);
    frames.forEach((frame, i) => {
      frame.scopeFlows.forEach((flow, j) => {
        for (const name of parameters(flow)) {
          expect(frame.scopes[j + 1]?.[name] ?? undefined, `frame ${i} ${flow} ${name}`).toBe(
            engineValue(i, j, name),
          );
        }
      });
    });
    for (const [flow, name, value] of expected.values()) {
      expect(savedParameterOf(frames, flow, name), `Load a save ${flow} ${name}`).toBe(value);
    }
  }
};

describe("saves made while playing", () => {
  it("plays on from the saved beat with its state", () => {
    const { program, compiler } = compileSrc(example.join("\n"));
    const game = playFromLine(program, compiler, START_LINE);
    advanceTo(game, "Where were you at nine?");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);
    expect(save.scene).toBe("interrogation");
    expect(save.line).toBe(10);

    const other = resumed(program, save.data);
    expect(shownText(other)).toContain("Where were you at nine?");
    expect(other.sceneTracker.current).toBe("interrogation");
    expect(other.story.currentChoices).toHaveLength(0);

    game.clickedToContinue();
    other.clickedToContinue();
    expect(other.story.currentChoices.map((c: any) => c.text)).toEqual(
      game.story.currentChoices.map((c: any) => c.text),
    );
  });

  it("writes one Last run save for each scene a Play enters", () => {
    const lines = [
      "store trust = 0",
      "",
      "scene start",
      "  Opening.",
      '  -> interrogation("nine")',
      "end",
      "",
      ...example.slice(4, 22),
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const saves: GameSave[] = [];
    const game = playFromLine(program, compiler, 4, (save) => saves.push(save));
    advanceTo(game, "Where were you at nine?");
    game.clickedToContinue();
    choose(game, "Tell the truth.");
    expect(saves.map((save) => save.scene)).toEqual(["start", "interrogation"]);
    expect(saves.map((save) => save.line)).toEqual([3, 13]);
    for (const save of saves) {
      expectEngineParameters(game, program, save);
    }

    const next: GameSave[] = [];
    playFromLine(program, compiler, 4, (save) => next.push(save));
    expect(next.map((save) => save.scene)).toEqual(["start"]);
  });

  it("names the scene's parameters in a Last run save loaded into its starting values", () => {
    const { program, compiler } = compileSrc(example.join("\n"));
    const saves: GameSave[] = [];
    const game = playFromLine(program, compiler, START_LINE, (save) =>
      saves.push(save),
    );
    const entering = saves.find((save) => save.scene === "interrogation")!;
    expect(entering).toBeDefined();
    expectEngineParameters(game, program, entering);
    expect(game.saveStartingValuesOf(entering, "interrogation")).toEqual({
      "param:hour": '"nine"',
      "visits:start": "1",
    });
  });

  it("keeps the values a scene was entered with in its Last run save", () => {
    const lines = [
      "store trust = 0",
      "",
      "scene start",
      "  Opening.",
      '  -> interrogation("nine")',
      "end",
      "",
      "scene interrogation(hour)",
      "  trust += 1",
      "  INSPECTOR:",
      "    At {hour}, trust is {trust}.",
      "  choose",
      "    * [Again.]",
      "      -> hallway",
      "    * [Stop.]",
      "      INSPECTOR:",
      "        Done.",
      "  end",
      "end",
      "",
      "scene hallway",
      '  -> interrogation("ten")',
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const saves: GameSave[] = [];
    const game = playFromLine(program, compiler, 4, (save) => saves.push(save));
    advanceTo(game, "At nine, trust is 1.");
    game.clickedToContinue();
    choose(game, "Again.");
    advanceTo(game, "At ten, trust is 2.");
    const entries = saves.filter((save) => save.scene === "interrogation");
    expect(entries).toHaveLength(2);
    for (const save of entries) {
      expectEngineParameters(game, program, save);
    }
    const listing = game.startingValueListing("interrogation");
    expect(game.saveStartingValuesOf(entries[0]!, "interrogation")).toEqual({
      "param:hour": '"nine"',
      "visits:start": "1",
    });
    expect(game.saveStartingValuesOf(entries[1]!, "interrogation")).toEqual({
      "param:hour": '"ten"',
      "store:trust": "1",
      "visits:start": "1",
      "visits:interrogation": "1",
      "visits:hallway": "1",
      [listing.items.find((item: { name: string }) => item.name === "Again.")!.key]: "1",
    });
  });

  it("finds the lines a save's counted options are on now", () => {
    const lines = [
      "scene start",
      "  choose",
      "    * [Stay.]",
      "      Stayed.",
      "    * [Leave.]",
      "      Left.",
      "  end",
      "  Done.",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 2);
    choose(game, "Leave.");
    advanceTo(game, "Left.");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);
    const counted = () =>
      Object.entries(game.saveStartingValuesOf(save, "start")).filter(([key]) =>
        key.startsWith("place:"),
      );
    expect(counted()).toEqual([[`place:0:4:${URI}`, "1"]]);

    recompile(compiler, game, ["", "", ...lines].join("\n"));
    expect(counted()).toEqual([[`place:0:6:${URI}`, "1"]]);

    recompile(
      compiler,
      game,
      ["", "", ...lines.filter((line) => !line.includes("Stay"))].join("\n"),
    );
    expect(counted()).toEqual([[`place:0:4:${URI}`, "1"]]);

    recompile(
      compiler,
      game,
      ["", "", ...lines.filter((line) => !/Leave|Left/.test(line))].join("\n"),
    );
    expect(counted()).toEqual([]);
  });

  it("keeps the position when a save's values are edited", () => {
    const { program, compiler } = compileSrc(example.join("\n"));
    const game = playFromLine(program, compiler, START_LINE);
    advanceTo(game, "Where were you at nine?");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);
    expect(game.saveValuesOf(save.data).values["store:trust"]).toBe("0");

    const edited = game.editSave(save, "store:trust", "5");
    expect(edited.edits).toBeUndefined();
    expect(game.saveValuesOf(edited.data).values["store:trust"]).toBe("5");
    expect(JSON.parse(edited.data).modules).toEqual(JSON.parse(save.data).modules);

    const other = resumed(program, edited.data);
    expect(shownText(other)).toContain("Where were you at nine?");
    other.clickedToContinue();
    choose(other, "Lie.");
    expect(shownText(other)).toContain("I believe you.");

    const unedited = resumed(program, save.data);
    unedited.clickedToContinue();
    choose(unedited, "Lie.");
    expect(shownText(unedited)).not.toContain("I believe you.");
  });

  it("reports a save as unplaceable once its line is deleted", () => {
    const { program, compiler } = compileSrc(example.join("\n"));
    const game = playFromLine(program, compiler, START_LINE);
    advanceTo(game, "Where were you at nine?");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);
    expect(game.saveRefusal(save.data)).toBeNull();

    const edited = example.map((line, i) =>
      i === 10 ? "    Where were you at {hour}, then?" : line,
    );
    recompile(compiler, game, edited.join("\n"));
    expect(game.saveRefusal(save.data)).toBeNull();

    const without = example.filter((_, i) => i !== 9 && i !== 10);
    recompile(compiler, game, without.join("\n"));
    expect(game.saveRefusal(save.data)).toBe("The saved line is gone.");
  });

  it("reads the scene's parameters by name when none of a save's beats places", () => {
    const lines = [
      "store trust = 0",
      "scene start",
      '  -> interrogation("nine")',
      "end",
      "scene interrogation(hour)",
      "  Saved {hour}.",
      "  Next.",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 3);
    advanceTo(game, "Saved nine.");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);

    recompile(compiler, game, [...lines.slice(0, 5), "  Replacement.", "end"].join("\n"));
    expect(game.saveRefusal(save.data)).toMatch(/cannot be placed/);
    expect(game.saveStartingValuesOf(save, "interrogation")).toMatchObject({
      "param:hour": '"nine"',
    });
    const edited = game.editSave(save, "local:0:hour", '"ten"');
    expect(edited.data).toBe(save.data);
    expect(game.saveStartingValuesOf(edited, "interrogation")).toMatchObject({
      "param:hour": '"ten"',
    });
  });

  it("reads a save's values by name when none of its beats places", () => {
    const { program, compiler } = compileSrc(example.join("\n"));
    const game = playFromLine(program, compiler, START_LINE);
    advanceTo(game, "Where were you at nine?");
    const save = game.editSave(game.saveHere(), "store:trust", "4");
    expectEngineParameters(game, program, save);

    recompile(
      compiler,
      game,
      ["store trust = 0", 'store suspect = "Ana"', "", "scene start", "  Gone.", "end"].join("\n"),
    );
    expect(game.saveRefusal(save.data)).toMatch(/cannot be placed/);
    expect(game.saveStartingValuesOf(save, "start")).toEqual({
      "store:trust": "4",
      "visits:start": "1",
    });
    const kept = game.editSave(save, "store:suspect", '"Bo"');
    expect(kept.data).toBe(save.data);
    expect(kept.edits).toEqual([["store:suspect", '"Bo"']]);
    expect(game.saveStartingValuesOf(kept, "start")).toEqual({
      "store:trust": "4",
      "store:suspect": '"Bo"',
      "visits:start": "1",
    });
  });

  it("reads and edits a store, not a local of the same name", () => {
    const lines = [
      "store trust = 1",
      "store bag = { coins = 1 }",
      "scene start",
      "  local trust = 9",
      "  local bag = { coins = 9 }",
      "  Saved {trust} {bag.coins}.",
      "  Next.",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 4);
    advanceTo(game, "Saved 9 9.");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);
    const before = game.saveListing(save, "start").values.values;
    expect(before["store:trust"]).toBe("1");
    expect(before["store:bag.coins"]).toBe("1");
    expect(before["local:0:trust"]).toBe("9");

    const edited = game.editSave(save, "store:bag.coins", "5");
    const after = game.saveListing(edited, "start").values.values;
    expect(after["store:bag.coins"]).toBe("5");
    expect(after["local:0:bag"]).toBe(before["local:0:bag"]);
    expect(game.saveStartingValuesOf(edited, "start")).toMatchObject({
      "store:bag.coins": "5",
    });
    expect(game.saveStartingValuesOf(edited, "start")["store:trust"]).toBeUndefined();

    const other = resumed(program, edited.data);
    other.clickedToContinue();
    const variables = other.story.state.variablesState;
    expect(variables.GetGlobalVariableValue("bag").value.get("coins").value).toBe(5);
    expect(variables.GetVariableWithName("bag").value.get("coins").value).toBe(9);
  });

  it("loads the parameters of the scene's innermost call", () => {
    const lines = [
      "scene start",
      "  Opening.",
      "  -> visit(1) ->",
      "  After.",
      "end",
      "scene visit(n)",
      "  At {n}.",
      "  if n == 1 then",
      "    -> visit(2) ->",
      "  end",
      "  Saved {n}.",
      "  ->->",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 2);
    advanceTo(game, "Saved 2.");
    const save: GameSave = game.saveHere();
    expect(save.scene).toBe("visit");
    expectEngineParameters(game, program, save);
    expect(game.saveStartingValuesOf(save, "visit")["param:n"]).toBe("2");

    recompile(compiler, game, [...lines.slice(0, 6), "  Replacement.", "  ->->", "end"].join("\n"));
    expect(game.saveRefusal(save.data)).toMatch(/cannot be placed/);
    expect(game.saveStartingValuesOf(save, "visit")["param:n"]).toBe("2");
  });

  it.each([
    ["a parameter of its own name", "m"],
    ["a parameter named like the scene's", "n"],
  ])(
    "loads the scene's parameters, and its branch's, from a save made in a tunnel into the scene's own branch with %s",
    (_, branchParameter) => {
      const lines = [
        "scene start",
        "  Opening.",
        "  -> visit(3) ->",
        "  After.",
        "end",
        "scene visit(n)",
        "  At {n}.",
        "  -> visit.inner(7) ->",
        "  Back {n}.",
        "  ->->",
        `  branch inner(${branchParameter})`,
        `    Saved {${branchParameter}}.`,
        "    ->->",
        "  end",
        "end",
      ];
      const { program, compiler } = compileSrc(lines.join("\n"));
      const game = playFromLine(program, compiler, 2);
      advanceTo(game, "Saved 7.");
      const save: GameSave = game.saveHere();
      expectEngineParameters(game, program, save);
      const expected = () => {
        expect(game.saveStartingValuesOf(save, "visit")["param:n"]).toBe("3");
        expect(game.saveStartingValuesOf(save, "visit.inner")[`param:${branchParameter}`]).toBe(
          "7",
        );
      };
      expected();

      recompile(
        compiler,
        game,
        [
          ...lines.slice(0, 6),
          "  Replacement.",
          "  ->->",
          `  branch inner(${branchParameter})`,
          "    ->->",
          "  end",
          "end",
        ].join("\n"),
      );
      expect(game.saveRefusal(save.data)).toMatch(/cannot be placed/);
      expected();
    },
  );

  it("edits the scene's parameter for the scene and its branch from a save made in a tunnel into that branch", () => {
    const lines = [
      "scene start",
      "  Opening.",
      "  -> visit(3) ->",
      "  After.",
      "end",
      "scene visit(n)",
      "  -> visit.inner ->",
      "  Back {n}.",
      "  ->->",
      "  branch inner",
      "    Saved {n}.",
      "    Next {n}.",
      "    ->->",
      "  end",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 2);
    advanceTo(game, "Saved 3.");
    const save: GameSave = game.saveHere();
    const values = game.saveValuesOf(save.data).values;
    const keys = Object.keys(values).filter((key) => /^local:\d+:n$/.test(key));
    expect(keys.map((key) => values[key])).toEqual(["3", "3"]);

    const edited = game.editSave(save, keys.at(-1)!, "8");
    const other = resumed(program, edited.data);
    other.clickedToContinue();
    expect(shownText(other)).toContain("Next 8.");
    other.clickedToContinue();
    expect(shownText(other)).toContain("Back 8.");
  });

  it("loads the scene's parameters from the call it returns to when another scene diverts into its branch", () => {
    const lines = [
      "scene start",
      "  Opening.",
      "  -> visit(3) ->",
      "  After.",
      "end",
      "scene visit(n)",
      "  At {n}.",
      "  -> bridge(5) ->",
      "  Back {n}.",
      "  ->->",
      "  branch inner(n)",
      "    Saved {n}.",
      "    ->->",
      "  end",
      "end",
      "scene bridge(m)",
      "  Over {m}.",
      "  -> visit.inner(7)",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 2);
    advanceTo(game, "Saved 7.");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);
    const expected = () => {
      expect(game.saveStartingValuesOf(save, "visit")["param:n"]).toBe("3");
      expect(game.saveStartingValuesOf(save, "visit.inner")["param:n"]).toBe("7");
      expect(game.saveStartingValuesOf(save, "bridge")["param:m"]).toBeUndefined();
    };
    expected();

    recompile(
      compiler,
      game,
      [
        ...lines.slice(0, 6),
        "  Replacement.",
        "  ->->",
        "  branch inner(n)",
        "    ->->",
        "  end",
        "end",
        ...lines.slice(15),
      ].join("\n"),
    );
    expect(game.saveRefusal(save.data)).toMatch(/cannot be placed/);
    expected();
  });

  it("loads each nested scene's parameter from its own call", () => {
    const lines = [
      "scene start",
      "  Opening.",
      "  -> a(1) ->",
      "end",
      "scene a(p)",
      "  -> b(2) ->",
      "  ->->",
      "end",
      "scene b(p)",
      "  -> c(3) ->",
      "  ->->",
      "end",
      "scene c(p)",
      "  Saved {p}.",
      "  ->->",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 2);
    advanceTo(game, "Saved 3.");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);
    expect(
      ["a", "b", "c"].map((scene) => game.saveStartingValuesOf(save, scene)["param:p"]),
    ).toEqual(["1", "2", "3"]);
  });

  it("loads the scene's parameter, not a block local of the same name", () => {
    const lines = [
      "scene start",
      "  Opening.",
      "  -> visit(3)",
      "end",
      "scene visit(n)",
      "  At {n}.",
      "  if true then",
      "    local n = 7",
      "    Saved {n}.",
      "    Next.",
      "  end",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 2);
    advanceTo(game, "Saved 7.");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);
    expect(game.saveStartingValuesOf(save, "visit")["param:n"]).toBe("3");
    expect(game.saveListing(save, "visit").values.values["local:0:n"]).toBe("7");
  });

  it("takes the scene's parameter in a branch the scene diverts into, as the game reads it there", () => {
    const lines = [
      "scene start",
      "  Opening.",
      "  -> visit(3)",
      "end",
      "scene visit(n)",
      "  -> visit.inner(7)",
      "  branch inner(n)",
      "    Saved {n}.",
      "    Next.",
      "  end",
      "end",
    ];
    const { program, compiler } = compileSrc(lines.join("\n"));
    const game = playFromLine(program, compiler, 2);
    advanceTo(game, "Saved 7.");
    const save: GameSave = game.saveHere();
    expectEngineParameters(game, program, save);
    expect(game.saveStartingValuesOf(save, "visit")["param:n"]).toBe("3");
    expect(game.saveStartingValuesOf(save, "visit.inner")["param:n"]).toBe("7");
  });
});
