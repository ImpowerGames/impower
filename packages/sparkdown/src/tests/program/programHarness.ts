// What the tests of the binary program share: a compile with statement chunks
// on (#694), the beats of a story on either engine, and a root described by
// content, which is how two compiles' chunks are compared.
import "../../inkjs/engine/Container";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkdownCompilerConfig } from "../../compiler/types/SparkdownCompilerConfig";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { Story } from "../../inkjs/engine/Story";
import { ObjectValue } from "../../runtime/Value";
import { ChunkStore } from "../../program/ChunkStore";
import { ProgramResolver } from "../../program/ProgramResolver";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { blockCount } from "../../program/StatementChunk";
import { describeRoot, flowRows } from "./describeRoot";

export { describeRoot };

// Every root a test builds is checked against the tables a cold build
// derives from its sequences (`ChunkStore.verifyBuilds`).
ChunkStore.verifyBuilds = true;
// And what the resolver knows from each statement's syntax in place of the
// walks of the whole story is checked against those walks after every
// resolve (`ProgramResolver.verifyFacts`), which `programCompiler`'s compile
// fails on.
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

/** A compiler over `texts`, keyed by uri, as `programCompiler` returns it:
 *  each compile's program with the current engine's story the compile made
 *  (the compile result leaves the story out), which is `S`. */
export interface ProgramCompiler<S extends Story | undefined> {
  compiler: SparkdownCompiler;
  compile(uri?: string): { program: SparkProgram; story: S };
}

/** A compiler over `texts`, keyed by uri. It compiles for the current engine
 *  unless `config` turns `programChunks` on, so that a test compares the
 *  program engine with it (#705 deletes that engine and these comparisons
 *  with it). A compile for the current engine makes its story. One with
 *  statement chunks makes none unless its program falls back, so its
 *  `story` may be undefined: typed so wherever `programChunks` can be on. */
export function programCompiler(
  texts: Record<string, string>,
  config: SparkdownCompilerConfig & { programChunks: true },
): ProgramCompiler<Story | undefined>;
export function programCompiler(
  texts: Record<string, string>,
  config?: SparkdownCompilerConfig & { programChunks?: false },
): ProgramCompiler<Story>;
export function programCompiler(
  texts: Record<string, string>,
  config: SparkdownCompilerConfig,
): ProgramCompiler<Story | undefined>;
export function programCompiler(
  texts: Record<string, string>,
  config: SparkdownCompilerConfig = {},
): ProgramCompiler<Story | undefined> {
  const compiler = new SparkdownCompiler();
  const compiled: { story?: Story } = {};
  compiler.addEventListener("compiler/didCompile", (params) => {
    compiled.story = params.story as Story | undefined;
  });
  compiler.configure({
    files: scriptFiles(texts) as never,
    programChunks: false,
    ...config,
  });
  return {
    compiler,
    compile(uri = MAIN_URI) {
      ProgramResolver.factFailures = [];
      const program = compiler.compile({ textDocument: { uri } }).program;
      if (ProgramResolver.factFailures.length > 0) {
        throw new Error(
          `ProgramResolver.verifyFacts: ${ProgramResolver.factFailures.join("; ")}`,
        );
      }
      return { program, story: compiled.story };
    },
  };
}

/** `programCompiler` over one script, compiled once: its program, the story
 *  as `programCompiler` gives it, and the compiler. */
export function compileScript(
  text: string,
  config: SparkdownCompilerConfig & { programChunks: true },
): { program: SparkProgram; story: Story | undefined; compiler: SparkdownCompiler };
export function compileScript(
  text: string,
  config?: SparkdownCompilerConfig & { programChunks?: false },
): { program: SparkProgram; story: Story; compiler: SparkdownCompiler };
export function compileScript(
  text: string,
  config: SparkdownCompilerConfig,
): { program: SparkProgram; story: Story | undefined; compiler: SparkdownCompiler };
export function compileScript(
  text: string,
  config: SparkdownCompilerConfig = {},
): { program: SparkProgram; story: Story | undefined; compiler: SparkdownCompiler } {
  const c = programCompiler({ [MAIN_URI]: text }, config);
  return { ...c.compile(), compiler: c.compiler };
}

/** A compiler over one script with statement chunks on, its first
 *  program's root, an edit that replaces one occurrence of `before` with
 *  `after` and compiles again, and a reseed of the compiler's table, which
 *  it makes by growing the table past what it bounds it at, with the last
 *  compile's program and the script's text as the edits left it.
 *  `configure` runs before the first compile. The compiler's console
 *  output is left out. */
export function programSession(
  text: string,
  configure?: (compiler: SparkdownCompiler) => void,
) {
  const c = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
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

/** A story's beats from its start, or from `from`, until it can no longer
 *  continue: each continue that showed something, with its text, tags and
 *  display tables, the errors and warnings it reported with their type, and
 *  how many continues it took, those that showed nothing included. `story`
 *  is either engine. */
export function storyBeats(
  story: Pick<
    Story,
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

/** A choice as a menu shows it: its text, its tags and its index. */
export interface MenuChoice {
  text: string;
  tags: string[];
  index: number;
}

/** A menu the story stopped at: after how many beats, the choices it showed,
 *  and the index of the one taken, or -1 when the run stopped there. */
export interface Menu {
  afterBeat: number;
  choices: MenuChoice[];
  picked: number;
}

/** A story's beats, as `storyBeats` gives them, through its menus: at each
 *  menu the choice `picks` names in turn is taken, wrapped to the number of
 *  choices shown, and past the end of `picks` the first one, until
 *  `maxChoices` choices were taken. `story` is either engine. */
export function storyRun(
  story: Pick<
    Story,
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

/** Every chunk of a root: its flows' statements, flow by flow in the order
 *  of their names, each block statement before its bodies' statements, then
 *  the declaration chunks in the order they run. */
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
