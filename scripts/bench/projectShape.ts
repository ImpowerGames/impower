// The sizes of a project that the measurements of #693 are taken at, read from
// the statement chunks a compile builds: how many statements the flow that
// holds a line is made of, sequence by sequence, and how large a symbol table
// the design would give the program: a symbol for each flow, label, choice body
// and every other kind the program's root defines, which are the kinds that
// count, and one for each global variable and each constant, which do not.
//
// The flow's sequences are its own, those of its branches, and the bodies of
// their block statements (the branches of an `if`, the body of a choice, a
// `then` clause), which is how the chunk layout holds them.
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { ProgramStory } from "../../packages/sparkdown/src/program/ProgramStory";
import { UNDEFINED_KIND } from "../../packages/sparkdown/src/program/ProgramSymbols";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles } from "./benchProject";

export interface ProjectShape {
  flow: string;
  /** Statements per sequence of the flow, largest first. */
  sequences: number[];
  flowStatements: number;
  /** Symbols of a kind that counts: those the program's root defines. */
  countedSymbols: number;
  globals: number;
  /** The program's constants, which the engine keeps out of its globals. */
  constants: number;
  /** The whole symbol table: counted symbols, globals and constants. */
  symbols: number;
}

export function measureProjectShape(project: string, line: number) {
  const startFrom = { file: MAIN_URI, line: line - 1 };
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, loadProjectFiles(project), startFrom);
  const cold: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  const root = cold.program.chunks;
  if (!root) throw new Error("the project did not compile");
  const game = new Game({ program: cold.program, ...benchSystem } as any);
  game.setStartFrom(startFrom);
  const flow = game.sceneOf(game.startAddress) ?? undefined;
  if (!flow) throw new Error(`line ${line} of main.sd maps to no story address`);
  // The top-level content's flow is named by the empty string.
  const own = root.flowNamed(flow) ?? (flow === "0" ? root.flowNamed("") : undefined);
  if (!own) throw new Error(`the program has no flow named ${flow}`);

  const sequences: number[] = [];
  for (const row of root.sequences()) {
    if (row.flow >= 0 && (row.flow === own.flow || root.parentOf(row.flow) === own.flow)) sequences.push(row.arrays.chunks.length);
  }
  sequences.sort((a, b) => b - a);

  const symbolCount: number = root.table.symbols.length;
  let countedSymbols = 0;
  for (let symbol = 0; symbol < symbolCount; symbol++) if (root.kindOf(symbol) !== UNDEFINED_KIND) countedSymbols++;
  const story = new ProgramStory(root);
  story.onError = (() => {}) as any;
  story.ResetState();
  const constantNames: ReadonlySet<string> = root.tables?.constantNames ?? new Set();
  const globalNames = [...((story.variablesState as any)["_globalVariables"] as Map<string, unknown>).keys()];
  const globals = globalNames.filter((name) => !constantNames.has(name)).length;
  const constants = constantNames.size;
  const shape: ProjectShape = {
    flow,
    sequences,
    flowStatements: sequences.reduce((a, b) => a + b, 0),
    countedSymbols,
    globals,
    constants,
    symbols: countedSymbols + globals + constants,
  };
  return { shape, cold, game, story };
}
