import { Container as RuntimeContainer } from "../../../engine/Container";
import type { InkObject as RuntimeObject } from "../../../engine/Object";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { ParsedObject } from "./Object";
import { resolutionTap } from "./ResolutionTap";
import type { Story } from "./Story";

/**
 * A statement of a block's body that the compilation annotator served from
 * its memo instead of lowering it (#656, `compiler/lower/statementMemo.ts`).
 * It stands where the statement's objects would stand, and holds none of
 * them: the memo holds the statement's program chunk, which the chunk store
 * keeps, and what its generation and resolution reported and read, which the
 * program path's resolver reports and reads again where it stands
 * (`ResolutionTap.memo`).
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
  }

  override get typeName(): string {
    return "MemoizedStatement";
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject | null => {
    const tap = resolutionTap();
    if (!tap) {
      throw new MemoizedStatementNeeded(this);
    }
    tap.memo(this, "generate");
    return new RuntimeContainer();
  };

  public override ResolveWith(_context: Story, program: boolean): void {
    const tap = resolutionTap();
    if (!program || !tap) {
      throw new MemoizedStatementNeeded(this);
    }
    tap.memo(this, "resolve");
  }

  public override EmitProgram(_emitter: ProgramEmitter): void {
    throw new MemoizedStatementNeeded(this);
  }
}

/** Thrown where a pass needs the objects of a statement its memo served. */
export class MemoizedStatementNeeded extends Error {
  constructor(readonly statement: MemoizedStatement) {
    super("A pass needs the objects of a statement served from its memo");
  }
}
