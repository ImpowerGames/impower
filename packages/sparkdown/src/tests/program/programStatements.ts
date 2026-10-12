// The statements of a compiler's main script that have chunks in the chunk
// store's current root, top-level and inside the bodies of block statements,
// for the tests that check which statements an edit left with their chunks.
// A statement the store emitted a chunk for in an earlier root, which the
// current program no longer runs (a function a broken `define` above it
// swallows), has none.
import type { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { CompiledBlock } from "../../compiler/classes/annotators/CompilationAnnotator";
import type { StatementShape } from "../../compiler/lower/utils/statementShape";
import type { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { ConstantDeclaration } from "../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { VariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { compilerNamedTexts, resolutionsOf } from "../../program/ChunkStore";
import { readsKey } from "../../program/programFlows";
import { MAIN_URI, rootChunks } from "./programHarness";

export interface ProgramStatement {
  /** The statement's node name, the column it starts at and its text. */
  syntax: string;
  /** The syntax, with everything the statement's chunk depends on outside
   *  it: the kinds of the block statements it stands in, what its lowering
   *  read, how the names it reads resolved, and the function declared at the
   *  top level it defines. A statement an edit left with the same key is one
   *  the edit did not touch. A function definition an edit moves out of an
   *  `if` block, or into one, keeps its text but not its chunk: the story
   *  defines one where it runs the other in place. Of the functions of one
   *  name, the story defines one under the name, so an edit to another of
   *  them can give the name to this one or take it away, and its chunk
   *  exports the name's symbol or an anonymous one. */
  key: string;
  from: number;
  to: number;
  chunk: Int32Array;
  /** Whether nothing its lowering or emission recorded ties its chunk to
   *  another statement: no lowering read of another line (a `routing` read),
   *  and no text the compiler names by document order. What the lowering
   *  found a name to be among a function's variadic functions, and what the
   *  functions it writes capture, are in its key. */
  untouchable: boolean;
}

// The initializers of the globals a declaration statement declares, which
// are the objects its declaration chunk runs.
const initializers = (objects: readonly ParsedObject[]): ParsedObject[] => {
  const out: ParsedObject[] = [];
  const visit = (obj: ParsedObject) => {
    if (obj instanceof ConstantDeclaration) {
      out.push(obj.expression);
      return;
    }
    if (obj instanceof VariableAssignment && obj.isGlobalDeclaration) {
      if (obj.expression) out.push(obj.expression);
      return;
    }
    for (const child of obj.content ?? []) visit(child);
  };
  objects.forEach(visit);
  return out;
};

/** The keys that stand once among a compile's statements. A statement whose
 *  key another one shares (the same line written in two scenes) cannot be
 *  told apart from it, so which of the two keeps a chunk is not asserted. */
export function uniqueKeys(statements: readonly ProgramStatement[]): Set<string> {
  const counts = new Map<string, number>();
  for (const { key } of statements) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n === 1).map(([key]) => key));
}

/** The chunks of the statements an edit covering `[from, to]` of the new
 *  text did not touch: away from the edit, keyed as a statement was keyed
 *  once before it and standing once after it, and with nothing recorded that
 *  ties the chunk to another statement. */
export function untouchedChunks(
  c: SparkdownCompiler,
  from: number,
  to: number,
  keysBefore: ReadonlySet<string>,
): Int32Array[] {
  const statements = programStatements(c);
  const unique = uniqueKeys(statements);
  return statements
    .filter(
      (s) =>
        (s.to < from - 1 || s.from > to + 1) &&
        keysBefore.has(s.key) &&
        unique.has(s.key) &&
        s.untouchable,
    )
    .map((s) => s.chunk);
}

export function programStatements(c: SparkdownCompiler): ProgramStatement[] {
  const store = c.chunkStore;
  const held = new Set(store?.current ? rootChunks(store.current) : []);
  const document = c.documents.get(MAIN_URI)!;
  const text = document.getText();
  const out: ProgramStatement[] = [];
  const visit = (
    shape: StatementShape,
    base: number,
    key: object,
    owners: string,
  ) => {
    const from = base + shape.from;
    const to = base + shape.to;
    const flowChunk = store?.chunkOf(key);
    const chunk = flowChunk ?? store?.declarationChunkOf(key);
    if (chunk && held.has(chunk)) {
      const syntax = `${shape.node} ${document.positionAt(from).character} ${text.slice(from, to)}`;
      const bodies = new Set(
        shape.bodies.flatMap((body) => body.statements.flatMap((s) => s.objects)),
      );
      out.push({
        syntax,
        key: [
          flowChunk ? "statement" : "declaration",
          owners,
          syntax,
          readsKey(shape.reads),
          ...resolutionsOf(
            flowChunk ? shape.objects : initializers(shape.objects),
            bodies,
          ),
          `defines:${store?.definesOf(chunk) ?? ""}`,
        ].join("\u0000"),
        from,
        to,
        chunk,
        untouchable:
          !shape.reads.other.some((read) => read.startsWith("routing:")) &&
          compilerNamedTexts(shape.objects).length === 0,
      });
    }
    for (const body of shape.bodies) {
      for (const nested of body.statements) {
        visit(nested, base, nested, `${owners}/${shape.node}`);
      }
    }
  };
  const cur = c.documents.annotations(MAIN_URI).compilations.iter();
  while (cur.value) {
    const block = cur.value.type as CompiledBlock;
    if (block.statement) {
      visit(
        {
          ...block.statement,
          to: Math.max(block.statement.to, cur.to - cur.from),
          objects: block.content?.[0]?.content ?? [],
        },
        cur.from,
        block,
        "",
      );
    }
    cur.next();
  }
  return out;
}
