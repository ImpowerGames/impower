import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkdownCompilerConfig } from "../../compiler/types/SparkdownCompilerConfig";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { ObjectValue } from "../../runtime/Value";
import { ChunkStore } from "../../program/ChunkStore";
import type { ProgramStory } from "../../program/ProgramStory";
import { ProgramResolver } from "../../program/ProgramResolver";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { blockCount } from "../../program/ProgramChunk";
import { describeRoot, flowRows } from "./describeRoot";

export { describeRoot };

ChunkStore.verifyBuilds = true;
ProgramResolver.verifyFacts = true;

export const MAIN_URI = "inmemory:///main.sd";

export const scriptFiles = (texts: Record<string, string>) =>
  Object.entries(texts).map(([uri, text]) => ({
    uri,
    type: "script",
    name: uri.split("/").at(-1)!.split(".")[0]!,
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  }));

export function assertNoSilentNoProgram(program: SparkProgram): void {
  if (program.chunks) {
    return;
  }
  const errors = Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1);
  if (errors.length === 0) {
    throw new Error("The compile made no program and reported no error.");
  }
}

export function programCompiler(
  texts: Record<string, string>,
  config: SparkdownCompilerConfig = {},
) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: scriptFiles(texts) as never,
    ...config,
  });
  return {
    compiler,
    compile(uri = MAIN_URI): { program: SparkProgram } {
      ProgramResolver.factFailures = [];
      const program = compiler.compile({ textDocument: { uri } }).program;
      if (ProgramResolver.factFailures.length > 0) {
        throw new Error(
          `ProgramResolver.verifyFacts: ${ProgramResolver.factFailures.join("; ")}`,
        );
      }
      assertNoSilentNoProgram(program);
      return { program };
    },
  };
}

export function errorsOf(program: SparkProgram): [number, string][] {
  return Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1)
    .map((d) => [
      d.range.start.line,
      typeof d.message === "string" ? d.message : d.message.value,
    ]);
}

export function compileScript(
  text: string,
  config: SparkdownCompilerConfig = {},
): { program: SparkProgram; compiler: SparkdownCompiler } {
  const c = programCompiler({ [MAIN_URI]: text }, config);
  return { ...c.compile(), compiler: c.compiler };
}

export function programSession(
  text: string,
  configure?: (compiler: SparkdownCompiler) => void,
) {
  const c = programCompiler({ [MAIN_URI]: text });
  configure?.(c.compiler);
  let current = text;
  let version = 1;
  let program: SparkProgram;
  const quiet = <T>(run: () => T): T => {
    const { warn, error, log } = console;
    console.warn = console.error = console.log = () => {};
    try {
      return run();
    } finally {
      console.warn = warn;
      console.error = error;
      console.log = log;
    }
  };
  const posAt = (offset: number) => {
    const before = current.slice(0, offset).split("\n");
    return { line: before.length - 1, character: before.at(-1)!.length };
  };
  const compile = () => quiet(() => (program = c.compile().program));
  return {
    compiler: c.compiler,
    root: compile().chunks!,
    get program(): SparkProgram {
      return program;
    },
    get text(): string {
      return current;
    },
    edit(before: string, after: string): ProgramRoot {
      const at = current.indexOf(before);
      if (at < 0) {
        throw new Error(`No ${JSON.stringify(before)} to edit.`);
      }
      version += 1;
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version },
        contentChanges: [
          { range: { start: posAt(at), end: posAt(at + before.length) }, text: after },
        ],
      });
      current = current.slice(0, at) + after + current.slice(at + before.length);
      return compile().chunks!;
    },
    reseed() {
      const compiler = c.compiler as any;
      const table = compiler._binaryTable;
      const grown = table.strings.length * 2 + 600;
      for (let i = 0; i < grown; i += 1) {
        table.strings.push(`unused ${i}`);
      }
      compiler.maybeReseedBinaryTable();
    },
  };
}

export interface Beat {
  text: string;
  tags: string[];
  tables: unknown[];
}

const tableEntries = (table: ObjectValue): unknown[] =>
  [...(table.value?.entries() ?? [])].map(([key, value]) => [
    key,
    value instanceof ObjectValue ? tableEntries(value) : value?.valueObject,
  ]);

export function storyBeats(
  story: Pick<
    ProgramStory,
    | "canContinue"
    | "Continue"
    | "ChoosePathString"
    | "currentTags"
    | "currentDisplayInstructions"
    | "onError"
  >,
  from?: string,
): { beats: Beat[]; errors: string[]; continues: number } {
  const errors: string[] = [];
  story.onError = (message, type) => {
    errors.push(`${type}: ${message}`);
  };
  if (from) {
    story.ChoosePathString(from);
  }
  const beats: Beat[] = [];
  let continues = 0;
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    continues += 1;
    if (!text && story.currentDisplayInstructions.length === 0) {
      continue;
    }
    beats.push({
      text,
      tags: [...(story.currentTags ?? [])],
      tables: story.currentDisplayInstructions.map(tableEntries),
    });
  }
  return { beats, errors, continues };
}

export interface MenuChoice {
  text: string;
  tags: string[];
  index: number;
}

export interface Menu {
  afterBeat: number;
  choices: MenuChoice[];
  picked: number;
}

export function storyRun(
  story: Pick<
    ProgramStory,
    | "canContinue"
    | "Continue"
    | "ChoosePathString"
    | "currentTags"
    | "currentDisplayInstructions"
    | "onError"
    | "ChooseChoiceIndex"
  > & { currentChoices: readonly { text: string; tags: string[] | null; index: number }[] },
  picks: readonly number[] = [],
  { from, maxChoices = 12 }: { from?: string; maxChoices?: number } = {},
): { beats: Beat[]; errors: string[]; continues: number; menus: Menu[] } {
  const beats: Beat[] = [];
  const errors: string[] = [];
  const menus: Menu[] = [];
  let continues = 0;
  let first = true;
  for (;;) {
    const run = storyBeats(story, first ? from : undefined);
    first = false;
    beats.push(...run.beats);
    errors.push(...run.errors);
    continues += run.continues;
    const choices = story.currentChoices.map((choice) => ({
      text: choice.text,
      tags: [...(choice.tags ?? [])],
      index: choice.index,
    }));
    if (choices.length === 0) {
      break;
    }
    if (menus.length >= maxChoices) {
      menus.push({ afterBeat: beats.length, choices, picked: -1 });
      break;
    }
    const picked = (picks[menus.length] ?? 0) % choices.length;
    menus.push({ afterBeat: beats.length, choices, picked });
    story.ChooseChoiceIndex(picked);
  }
  return { beats, errors, continues, menus };
}

export const rootChunks = (root: ProgramRoot): Int32Array[] => [
  ...flowRows(root).flatMap((flow) => sequenceChunks(root, flow)),
  ...root.initialization,
];

const sequenceChunks = (root: ProgramRoot, sequence: SequenceRow): Int32Array[] =>
  sequence.arrays.chunks.flatMap((chunk) => [
    chunk,
    ...Array.from({ length: blockCount(chunk) }, (_, k) => {
      const body = root.body(chunk, k);
      return body ? sequenceChunks(root, body) : [];
    }).flat(),
  ]);
