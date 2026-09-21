// The sizes of a project that the measurements of #693 are taken at: how many
// statements the flow that holds a line is made of, how many records that flow
// is in #314's encoding, how many names the program would intern as symbols,
// and how many global variables a story of it holds.
//
// The statement count is an estimate read from the compiled JSON tree, because
// no writer exists yet that emits a real project as chunks: a statement is an
// `ev ... /ev` run with the assignment that follows it, a conditional with its
// rejoin point, a `choose` block, a divert, or a line of flat text. The
// statements of a conditional's branches, of a choice's body and of a `then`
// clause are counted as sequences of their own, which is how the chunk layout
// holds them.
import "../../packages/sparkdown/src/inkjs/engine/Container";
import { NODE_WIDTH, buildProgramBuffer } from "../../packages/sparkdown/src/binary/programBinary";
import { SparkdownCompiler } from "../../packages/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Story } from "../../packages/sparkdown/src/inkjs/engine/Story";
import { Game } from "../../packages/spark-engine/src/game/core/classes/Game";
import { MAIN_URI, benchSystem, configurePlayerCompiler, loadProjectFiles } from "./benchProject";
import { buildProgramIndex } from "./bufferStepper";

export interface ProjectShape {
  flow: string;
  programRecords: number;
  flowRecords: number;
  /** Statements per sequence of the flow, largest first. */
  sequences: number[];
  flowStatements: number;
  symbols: number;
  globals: number;
}

const isObject = (x: unknown): x is Record<string, any> => x !== null && typeof x === "object" && !Array.isArray(x);

function matching(items: any[], from: number, open: string, close: string): number {
  let depth = 0;
  for (let k = from; k < items.length; k++) {
    if (items[k] === open) depth++;
    else if (items[k] === close && --depth === 0) return k;
  }
  return items.length - 1;
}

// Appends the length of the sequence `items` holds, and of every sequence
// nested in it, to `out`.
function countSequences(items: any[], out: number[]) {
  out.push(countStatements(items, out));
}

// The statements `items` holds at its own level. The sequences nested in them
// go to `out`.
function countStatements(items: any[], out: number[]): number {
  let count = 0;
  let inText = false;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === "ev") {
      i = matching(items, i, "ev", "/ev");
      if (isObject(items[i + 1]) && ("VAR=" in items[i + 1] || "temp=" in items[i + 1])) i++;
      count++;
      inText = false;
    } else if (Array.isArray(item)) {
      const named = isObject(item.at(-1)) ? (item.at(-1) as Record<string, any>) : {};
      const bodies = Object.entries(named).filter(([name, body]) => /^[cg]-[0-9]+$/.test(name) && Array.isArray(body));
      if (Array.isArray(named["$b"])) {
        // A conditional: its branches, up to the rejoin point.
        for (; Array.isArray(items[i]) && Array.isArray(items[i].at(-1)?.["$b"]); i++) countSequences(items[i].at(-1)["$b"].slice(0, -2), out);
        if (items[i] !== "nop") i--;
        count++;
      } else if (bodies.length > 0) {
        // A `choose` block: the bodies of its choices and its `then` clause.
        for (const [, body] of bodies) countSequences(body.slice(0, -1), out);
        count++;
      } else {
        // A container the engine walks straight through, such as the one a
        // scene that opens with a tag wraps its whole body in.
        count += countStatements(item.slice(0, -1), out);
      }
      inText = false;
    } else if (isObject(item)) {
      count++;
      inText = false;
    } else if (typeof item === "string" && (item.startsWith("^") || item === "\n")) {
      if (!inText) count++;
      inText = item !== "\n";
    }
  }
  return count;
}

// Names a program of chunks would intern as symbols: every named container but
// the return and branch labels that exist only in the JSON tree's own protocol.
function countSymbols(container: any[]): number {
  let count = 0;
  for (const item of container) if (Array.isArray(item)) count += countSymbols(item);
  const named = container.at(-1);
  if (isObject(named)) {
    for (const [name, body] of Object.entries(named)) {
      if (!Array.isArray(body)) continue;
      if (!name.startsWith("$")) count++;
      count += countSymbols(body);
    }
  }
  return count;
}

export function measureProjectShape(project: string, line: number) {
  const startFrom = { file: MAIN_URI, line: line - 1 };
  const compiler = new SparkdownCompiler();
  configurePlayerCompiler(compiler, loadProjectFiles(project), startFrom);
  const cold: any = compiler.compile({ textDocument: { uri: MAIN_URI }, startFrom } as any);
  const compiled: Record<string, any> = cold.program.compiled;
  if (!compiled) throw new Error("the project did not compile");
  const game = new Game({ program: cold.program, ...benchSystem } as any);
  game.setStartFrom(startFrom);
  const flow = game.startPath?.split(".")[0];
  if (!flow) throw new Error(`line ${line} of main.sd maps to no story path`);

  const buffer = buildProgramBuffer(compiled);
  const index = buildProgramIndex(buffer);
  const flowAt = index.named.get(index.root)?.get(flow);
  const container: any[] | undefined = compiled["root"].at(-1)[flow];
  if (flowAt == null || !container) throw new Error(`the program has no flow named ${flow}`);

  const sequences: number[] = [];
  countSequences(container.slice(0, -1), sequences);
  const named = container.at(-1);
  if (isObject(named)) for (const body of Object.values(named)) if (Array.isArray(body)) countSequences(body.slice(0, -1), sequences);
  sequences.sort((a, b) => b - a);

  const story = new Story(compiled);
  story.onError = (() => {}) as any;
  story.ResetState();
  const shape: ProjectShape = {
    flow,
    programRecords: buffer.nodes.length / NODE_WIDTH,
    flowRecords: buffer.nodes[flowAt * NODE_WIDTH + 2]!,
    sequences,
    flowStatements: sequences.reduce((a, b) => a + b, 0),
    symbols: countSymbols(compiled["root"]),
    globals: ((story.state.variablesState as any)["_globalVariables"] as Map<string, unknown>).size,
  };
  return { shape, compiled, cold, game, story };
}
