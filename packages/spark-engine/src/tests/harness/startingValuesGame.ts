import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { StartingValues } from "@impower/sparkdown/src/program/startingValueLiterals";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "./compileProgram";

export const URI = "inmemory:///main.sd";

export function compileSrc(src: string) {
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

export const newGame = (program: unknown) =>
  new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

export function routeTo(lines: string[], line: number, values: StartingValues = {}) {
  const { compiler, program } = compileSrc(lines.join("\n"));
  const game: any = newGame(program);
  game.scriptLineText = (uri: string, at: number) =>
    compiler.documents.get(uri)?.getLineText(at);
  game.setStartingValues(values);
  game.setStartFrom({ file: URI, line: line - 1 });
  game.simulate();
  return { game, compiler };
}

export const shown = (game: any): string => game.story.currentText ?? "";

export const decisionsOf = (game: any, compiler: SparkdownCompiler) =>
  game
    .previewRouteOf(game.plannedRoute, {
      lineText: (uri: string, at: number) =>
        compiler.documents.get(uri)?.getLineText(at),
      structure: (uri: string) => compiler.structureOf(uri),
    })
    .decisions.map((d: any) => d.kind);

export const example = [
  "store trust = 0",
  'store suspect = "Ana"',
  '-> interrogation("nine")',
  "",
  "scene interrogation(hour)",
  "  if count.visits(-> interrogation) > 1 then",
  "    INSPECTOR:",
  "      Back again, {suspect}?",
  "  end",
  "  INSPECTOR:",
  "    Where were you at {hour}?",
  "  choose",
  "    * [Tell the truth.]",
  "      trust += 2",
  "    * [Lie.]",
  "      trust -= 1",
  "  end",
  "  if trust > 3 then",
  "    INSPECTOR:",
  "      I believe you.",
  "  end",
  "end",
];

export const recompile = (compiler: SparkdownCompiler, game: any, text: string) => {
  const doc = compiler.documents.get(URI)!;
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: (doc as any).version + 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  game.updateProgram(
    requireChunks(compiler.compile({ textDocument: { uri: URI } }).program),
  );
};
