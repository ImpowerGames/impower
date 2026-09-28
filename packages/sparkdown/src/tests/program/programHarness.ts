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
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  H_FINGERPRINT,
  H_LAYOUT_HASH,
  H_LINE_ROWS,
  H_REFERENCE_ROWS,
  LINE_ROW_WORDS,
  REFERENCE_ROW_WORDS,
  lineTableStart,
  referenceTableStart,
} from "../../program/StatementChunk";

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

/** Every chunk of a root, flow by flow in the order of their names. */
export const rootChunks = (root: ProgramRoot): Int32Array[] =>
  [...root.sequences()]
    .sort((a, b) =>
      root.table.symbols[a.flow]!.localeCompare(root.table.symbols[b.flow]!),
    )
    .flatMap((sequence) => [...sequence.arrays.chunks]);

/** A root by content: per flow, its kind, script, first line and span, and
 *  per statement its line start, its instructions with every id read as what
 *  it names, its line table, its reference table with each symbol read as its
 *  name, and its fingerprint and layout hash. Chunk ids and sequence ids are
 *  left out, since they count every chunk a store has made. */
export function describeRoot(root: ProgramRoot): string[] {
  const reader = new BinaryProgramReader(root);
  const out: string[] = [];
  const flows = [...root.sequences()].sort((a, b) =>
    root.table.symbols[a.flow]!.localeCompare(root.table.symbols[b.flow]!),
  );
  for (const flow of flows) {
    out.push(
      `flow ${JSON.stringify(root.table.symbols[flow.flow])} kind ${root.table.symbolKinds[flow.flow]} ${flow.uri} first ${flow.firstLine} span ${flow.span}`,
    );
    flow.arrays.chunks.forEach((chunk, entry) => {
      const rows: number[][] = [];
      const start = lineTableStart(chunk);
      for (let r = 0; r < chunk[H_LINE_ROWS]!; r += 1) {
        rows.push([...chunk.subarray(start + r * LINE_ROW_WORDS, start + (r + 1) * LINE_ROW_WORDS)]);
      }
      const references: string[] = [];
      const refs = referenceTableStart(chunk);
      for (let r = 0; r < chunk[H_REFERENCE_ROWS]!; r += 1) {
        const at = refs + r * REFERENCE_ROW_WORDS;
        references.push(`${JSON.stringify(root.table.symbols[chunk[at]!])}:${chunk[at + 1]}`);
      }
      out.push(
        `  ${flow.arrays.lineStarts[entry]} ${[...chunk.subarray(H_FINGERPRINT, H_LAYOUT_HASH + 2)].join(",")} rows ${JSON.stringify(rows)} refs [${references.join(" ")}]`,
      );
    });
    for (const line of reader.listing(flow)) {
      if (line.startsWith(" ")) {
        out.push(`  ${line}`);
      }
    }
  }
  return out;
}
