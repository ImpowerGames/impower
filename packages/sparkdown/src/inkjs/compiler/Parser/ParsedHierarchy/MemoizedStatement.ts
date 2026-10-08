import { Container as RuntimeContainer } from "../../../engine/Container";
import { DebugMetadata } from "../../../engine/DebugMetadata";
import type { InkObject as RuntimeObject } from "../../../engine/Object";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { ParsedObject } from "./Object";
import { resolutionTap } from "./ResolutionTap";
import type { Story } from "./Story";

// The memo a served statement's stand-in was served from.
const MEMO = Symbol("statementMemo");

/** The memo (`StatementMemoEntry`) `obj` was served from, when `obj` stands
 *  for a statement of a block's body the compilation annotator served from
 *  its memo instead of lowering it (#656), or undefined. */
export const memoOf = (obj: ParsedObject | null | undefined): object | undefined =>
  obj ? (obj as unknown as { [MEMO]?: object })[MEMO] : undefined;

/** Where an object's name stands, relative to the object's own position:
 *  lines counted from its first line, and the columns they start and end
 *  at. */
export interface MemoPosition {
  readonly line: number;
  readonly endLine: number;
  readonly start: number;
  readonly end: number;
}

/** Where `obj`'s name stands relative to `obj` (`MemoPosition`), or null
 *  when either has no position. */
export const namePosition = (obj: ParsedObject): MemoPosition | null => {
  const own = obj.ownDebugMetadata;
  const name = obj.identifier?.debugMetadata;
  if (!own || !name) {
    return null;
  }
  return {
    line: name.startLineNumber - own.startLineNumber,
    endLine: name.endLineNumber - own.startLineNumber,
    start: name.startCharacterNumber,
    end: name.endCharacterNumber,
  };
};

/** Places a stand-in's name where the statement's stood (`namePosition`),
 *  once the stand-in has its own position: what the story reports about
 *  the name (a local or a label declared twice) is reported there. */
export const placeIdentifier = (obj: ParsedObject, at: MemoPosition | null): void => {
  const own = obj.ownDebugMetadata;
  if (!at || !own || !obj.identifier) {
    return;
  }
  const position = new DebugMetadata(own);
  position.startLineNumber = own.startLineNumber + at.line;
  position.endLineNumber = own.startLineNumber + at.endLine;
  position.startCharacterNumber = at.start;
  position.endCharacterNumber = at.end;
  obj.identifier.debugMetadata = position;
};

/** Marks `obj` as the stand-in of a statement served from `memo`. */
export const markMemoized = (obj: ParsedObject, memo: object): void => {
  (obj as unknown as { [MEMO]?: object })[MEMO] = memo;
};

/** What a stand-in's generation does: the program path's resolver reports
 *  again what the statement's memo recorded (`ResolutionTap.memo`); with no
 *  resolver listening, the pass needs the statement's objects. */
export const memoGenerate = (obj: ParsedObject): void => {
  const tap = resolutionTap();
  if (!tap) {
    throw new MemoizedStatementNeeded(obj);
  }
  tap.memo(obj, "generate");
};

/** What a stand-in's resolution does, as `memoGenerate`. */
export const memoResolve = (obj: ParsedObject, program: boolean): void => {
  const tap = resolutionTap();
  if (!program || !tap) {
    throw new MemoizedStatementNeeded(obj);
  }
  tap.memo(obj, "resolve");
};

/**
 * A statement of a block's body that the compilation annotator served from
 * its memo instead of lowering it (#656, `compiler/lower/statementMemo.ts`).
 * It stands where the statement's objects would stand, and holds none of
 * them: the memo holds the statement's program chunk, which the chunk store
 * keeps, and what its generation and resolution reported and read, which the
 * program path's resolver reports and reads again where it stands
 * (`ResolutionTap.memo`).
 *
 * A statement whose objects another pass reads for what they are (a divert,
 * whose kind the weave and the flow's checks read) stands as an object of
 * that class instead, built from what its memo recorded of it, which goes
 * through the memo the same way (`memoOf`, `MemoizedDivert`).
 *
 * Only a compile with statement chunks on lowers one. A compile that cannot
 * go on without the statement's objects (a program that falls back to the
 * current engine, a chunk the store cannot keep) lowers the block again
 * without the memo (`StatementMemoRetry`).
 */
export class MemoizedStatement extends ParsedObject {
  constructor(
    /** The memo it was served from (`StatementMemoEntry`). */
    readonly memo: object,
  ) {
    super();
    markMemoized(this, memo);
  }

  override get typeName(): string {
    return "MemoizedStatement";
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject | null => {
    memoGenerate(this);
    return new RuntimeContainer();
  };

  public override ResolveWith(_context: Story, program: boolean): void {
    memoResolve(this, program);
  }

  public override EmitProgram(_emitter: ProgramEmitter): void {
    throw new MemoizedStatementNeeded(this);
  }
}

/** Thrown where a pass needs the objects of a statement its memo served. */
export class MemoizedStatementNeeded extends Error {
  constructor(readonly statement: ParsedObject) {
    super("A pass needs the objects of a statement served from its memo");
  }
}
