import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { describe, expect, it } from "vitest";
import { Game } from "./Game";

/**
 * #314 phase 3: the compiled program travels to the runtime as binary buffer
 * PIECES instead of a JS object graph.
 *
 * The hop that matters is the `compiler/compile` response from the compiler
 * worker to its host, which is a structured clone over a MessagePort. So these
 * tests clone the program before using it — a test that skipped the clone
 * would pass even if the buffer were something structured clone cannot carry,
 * which is the whole risk of changing what crosses that boundary.
 */

const SOURCE = [
  "title: Transport",
  "",
  "define hero as character:",
  `  name = "Hero"`,
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

const compile = (source: string, binaryProgram: boolean) => {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    binaryProgram,
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

describe("binary program transport (#314 phase 3)", () => {
  it("survives the structured clone that crosses the worker boundary", () => {
    const program = compile(SOURCE, true) as any;
    expect(program.compiledBuffer, "binary path must be on").toBeTruthy();
    expect(program.compiled).toBeUndefined();

    const relayed = structuredClone(program);
    // Typed arrays and the string table are exactly what makes this cheap:
    // structured clone copies them as buffers rather than walking ~33k nodes.
    expect(ArrayBuffer.isView(relayed.compiledBuffer.nodes)).toBe(true);
    expect(relayed.compiledBuffer.nodes.length).toBe(
      program.compiledBuffer.nodes.length,
    );
    expect(relayed.compiledBuffer.strings.length).toBe(
      program.compiledBuffer.strings.length,
    );
    expect(ArrayBuffer.isView(relayed.compiledBuffer.numbers)).toBe(true);
  });

  it("builds a runnable Game from the relayed buffer alone", () => {
    const relayed = structuredClone(compile(SOURCE, true)) as any;
    const emitted: string[] = [];
    const game = makeGame(relayed);
    game.connection.outgoing.addListener("*", (message) => {
      emitted.push((message as { method: string }).method);
    });
    expect(game.story).toBeTruthy();
    // Not merely constructed: it has to actually run and emit flow events.
    game.start();
    expect(emitted).toContain("game/started");
  });

  it("produces the same story as the JSON path", () => {
    // The gate. If the two paths ever diverge, the JSON fallback stops being a
    // fallback and starts being a different program.
    const viaJson = compile(SOURCE, false) as any;
    const viaBinary = structuredClone(compile(SOURCE, true)) as any;

    const jsonGame = makeGame(viaJson);
    const binaryGame = makeGame(viaBinary);

    const drain = (game: Game) => {
      const out: string[] = [];
      for (let i = 0; i < 20 && game.story.canContinue; i += 1) {
        out.push(game.story.Continue() ?? "");
      }
      return out;
    };
    expect(drain(binaryGame)).toEqual(drain(jsonGame));
  });

  it("rejects a program with neither representation", () => {
    // The readiness gates were `Boolean(program.compiled)` before #314; if any
    // were missed, a binary program reads as "not compiled" — so the negative
    // case has to stay a hard failure rather than silently degrade.
    const program = compile(SOURCE, false) as any;
    delete program.compiled;
    expect(() => makeGame(program)).toThrow(/must be successfully compiled/);
  });
});
