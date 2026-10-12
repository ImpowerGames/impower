import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { Game } from "./Game";

/**
 * A game runs the statement chunks a compile builds (`program.chunks`), and
 * refuses a program that holds none, which a readiness gate that missed it
 * would otherwise let through as a program that silently does nothing.
 */

const SOURCE = [
  "title: Transport",
  "",
  "define hero as character with",
  `  name = "Hero"`,
  "end",
  "",
  "const LIMIT = 3",
  "store trust = 0",
  "",
  "First beat with {trust} and {LIMIT}.",
  "",
  "hero:",
  "  A line of dialogue.",
  "",
  "Second beat.",
  "",
].join("\n");

const compile = (source: string) => {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri } } as never).program;
};

/** Same system wiring the other engine suites use; Game requires it to run. */
const makeGame = (program: unknown) =>
  new Game({
    program,
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);

describe("a program a game is given", () => {
  it("rejects a program with no statement chunks", () => {
    const program = compile(SOURCE) as any;
    expect(program.chunks).toBeDefined();
    delete program.chunks;
    expect(() => makeGame(program)).toThrow(/must be successfully compiled/);
  });
});
