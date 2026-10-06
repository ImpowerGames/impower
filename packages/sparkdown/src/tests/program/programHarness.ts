// What the tests of the binary program share: a compile with statement chunks
// on (#694), the beats of a story on either engine, and a root described by
// content, which is how two compiles' chunks are compared.
import "../../inkjs/engine/Container";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkdownCompilerConfig } from "../../compiler/types/SparkdownCompilerConfig";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { Story } from "../../inkjs/engine/Story";
import { ObjectValue } from "../../inkjs/engine/Value";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { ChunkStore } from "../../program/ChunkStore";
import { describeInstruction } from "../../program/BinaryProgramWriter";
import type { ProgramRoot, SequenceRow } from "../../program/ProgramRoot";
import { isAnonymousSymbol, SymbolKind } from "../../program/ProgramSymbols";
import {
  B_BREAK,
  B_HEAD_LINES,
  B_RESUME,
  B_SCOPES_FLAGS,
  H_FINGERPRINT,
  H_LAYOUT_HASH,
  H_LINE_ROWS,
  H_REFERENCE_ROWS,
  LINE_ROW_WORDS,
  REFERENCE_ROW_WORDS,
  blockCount,
  blockField,
  chunkId,
  exportCount,
  exportSymbol,
  lineTableStart,
  referenceTableStart,
} from "../../program/StatementChunk";

// Every root a test builds is checked against the tables a cold build
// derives from its sequences (`ChunkStore.verifyBuilds`).
ChunkStore.verifyBuilds = true;

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

/** A compiler over `texts`, keyed by uri, with the story each compile
 *  produced in `stories` (the compile result leaves the story out). */
export function programCompiler(
  texts: Record<string, string>,
  config: SparkdownCompilerConfig = {},
) {
  const compiler = new SparkdownCompiler();
  const compiled: { story?: Story } = {};
  compiler.addEventListener("compiler/didCompile", (params) => {
    compiled.story = params.story as Story | undefined;
  });
  compiler.configure({ files: scriptFiles(texts) as never, ...config });
  return {
    compiler,
    compile(uri = MAIN_URI): { program: SparkProgram; story: Story } {
      const program = compiler.compile({ textDocument: { uri } }).program;
      return { program, story: compiled.story! };
    },
  };
}

export function compileScript(
  text: string,
  config: SparkdownCompilerConfig = {},
): { program: SparkProgram; story: Story; compiler: SparkdownCompiler } {
  const c = programCompiler({ [MAIN_URI]: text }, config);
  return { ...c.compile(), compiler: c.compiler };
}

/** A compiler over one script with statement chunks on, its first
 *  program's root, an edit that replaces one occurrence of `before` with
 *  `after` and compiles again, and a reseed of the compiler's table, which
 *  it makes by growing the table past what it bounds it at. The compiler's
 *  console output is left out. */
export function programSession(text: string) {
  const c = programCompiler({ [MAIN_URI]: text }, { programChunks: true });
  let current = text;
  let version = 1;
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
  return {
    compiler: c.compiler,
    root: quiet(() => c.compile().program.chunks!),
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
      return quiet(() => c.compile().program.chunks!);
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

const flowRows = (root: ProgramRoot) =>
  root
    .flowSequences()
    .sort((a, b) =>
      root.table.symbols[a.flow]!.localeCompare(root.table.symbols[b.flow]!),
    );

const sequenceChunks = (root: ProgramRoot, sequence: SequenceRow): Int32Array[] =>
  sequence.arrays.chunks.flatMap((chunk) => [
    chunk,
    ...Array.from({ length: blockCount(chunk) }, (_, k) => {
      const body = root.body(chunk, k);
      return body ? sequenceChunks(root, body) : [];
    }).flat(),
  ]);

/** A root by content: per flow, its kind, script, first line and span; per
 *  statement its line start, its instructions with every id read as what it
 *  names, its line table, its block table without the sequence ids, its
 *  reference table with each symbol read as its name, and its fingerprint
 *  and layout hash; and each body's first line and span, the same way inside
 *  it. The declaration sequences follow, script by script, with the order
 *  the declarations run in. Chunk ids and sequence ids are left out, since
 *  they count every chunk and body a store has made, and so are the ids of
 *  anonymous symbols: a function a statement writes is read as the
 *  fingerprint of the chunk that defines it and its row in that chunk's
 *  export table. */
export function describeRoot(root: ProgramRoot): string[] {
  const reader = new BinaryProgramReader(root);
  const out: string[] = [];
  const symbolName = (symbol: number): string => {
    if (!isAnonymousSymbol(root.table, symbol)) {
      return JSON.stringify(root.table.symbols[symbol]);
    }
    if (root.kindOf(symbol) === SymbolKind.Alternator) {
      return "alternator";
    }
    if (root.kindOf(symbol) === SymbolKind.Choice) {
      return "choice";
    }
    const at = root.definition(symbol);
    const chunk = at ? root.sequence(at.sequence)?.arrays.chunks[at.entry] : undefined;
    if (!chunk) {
      return "function";
    }
    for (let row = 0; row < exportCount(chunk); row += 1) {
      if (exportSymbol(chunk, row) === symbol) {
        return `function@${[...chunk.subarray(H_FINGERPRINT, H_FINGERPRINT + 2)].join(",")}#${row}`;
      }
    }
    return "function";
  };
  const describeSequence = (sequence: SequenceRow, indent: string) => {
    sequence.arrays.chunks.forEach((chunk, entry) => {
      const rows: number[][] = [];
      const start = lineTableStart(chunk);
      for (let r = 0; r < chunk[H_LINE_ROWS]!; r += 1) {
        rows.push([...chunk.subarray(start + r * LINE_ROW_WORDS, start + (r + 1) * LINE_ROW_WORDS)]);
      }
      const blocks: number[][] = [];
      for (let k = 0; k < blockCount(chunk); k += 1) {
        blocks.push([B_RESUME, B_BREAK, B_SCOPES_FLAGS, B_HEAD_LINES].map((f) => blockField(chunk, k, f)));
      }
      const references: string[] = [];
      const refs = referenceTableStart(chunk);
      for (let r = 0; r < chunk[H_REFERENCE_ROWS]!; r += 1) {
        const at = refs + r * REFERENCE_ROW_WORDS;
        references.push(`${symbolName(chunk[at]!)}:${chunk[at + 1]}`);
      }
      out.push(
        `${indent}${sequence.arrays.lineStarts[entry]} ${[...chunk.subarray(H_FINGERPRINT, H_LAYOUT_HASH + 2)].join(",")} rows ${JSON.stringify(rows)} blocks ${JSON.stringify(blocks)} refs [${references.join(" ")}]`,
      );
      for (const { offset } of reader.instructions(chunk)) {
        out.push(
          `${indent}  ${offset}: ${describeInstruction(chunk, offset, root.table, symbolName)}`,
        );
      }
      for (let k = 0; k < blockCount(chunk); k += 1) {
        const body = root.body(chunk, k);
        out.push(`${indent}  block ${k} first ${body ? root.firstLineOf(body) : undefined} span ${body?.span}`);
        if (body) {
          describeSequence(body, `${indent}    `);
        }
      }
    });
  };
  for (const flow of flowRows(root)) {
    out.push(
      `flow ${JSON.stringify(root.table.symbols[flow.flow])} kind ${flow.kind} ${flow.uri} first ${flow.firstLine} span ${flow.span}`,
    );
    describeSequence(flow, "  ");
  }
  // The declaration sequences, by script; the bodies of the functions their
  // statements write are described with the statements that own them. A
  // root holds its rows in no order of its own: one built over the previous
  // root keeps the previous root's.
  const scripts = [...root.sequences()]
    .filter((row) => row.flow < 0 && row.owner < 0)
    .sort((a, b) => a.uri.localeCompare(b.uri));
  for (const row of scripts) {
    out.push(`declarations ${row.uri} span ${row.span}`);
    describeSequence(row, "  ");
  }
  out.push(
    `initialization ${root.initialization
      .map((chunk) => {
        const at = root.position(chunkId(chunk));
        return at ? `${at.sequence.uri}#${at.entry}` : "?";
      })
      .join(" ")}`,
  );
  return out;
}
