import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Identifier } from "../Identifier";
import {
  type MemoPosition,
  namePosition,
  markMemoized,
  memoGenerate,
  memoResolve,
  MemoizedStatementNeeded,
} from "../MemoizedStatement";
import type { Story } from "../Story";
import { Gather } from "./Gather";

/** What a statement's memo records of a label the statement is (#656): its
 *  name and its depth, which the weave builds its weave points from and the
 *  story's passes over the whole program name the label by, and whether it
 *  ends a `choose` block. */
export interface MemoGather {
  readonly kind: "gather";
  readonly name: string;
  readonly indentationDepth: number;
  readonly endsChooseBlock: boolean;
  /** Where its name stands relative to it. */
  readonly at: MemoPosition | null;
}

/** What a statement's memo records of the label the statement lowered to,
 *  or null for a gather it cannot stand for: one with no name, or one that
 *  holds objects of its own. */
export const memoGatherOf = (gather: Gather): MemoGather | null => {
  const name = gather.name;
  if (!name || (gather.content?.length ?? 0) > 0) {
    return null;
  }
  return {
    kind: "gather",
    name,
    indentationDepth: gather.indentationDepth,
    endsChooseBlock: gather.endsChooseBlock,
    at: namePosition(gather),
  };
};

/**
 * A label statement served from its memo (`MemoizedStatement`): a gather of
 * the same name and depth, holding nothing, built from what the memo
 * recorded (`MemoGather`), whose generation and resolution go through the
 * memo.
 */
export class MemoizedGather extends Gather {
  constructor(
    readonly memo: object,
    recorded: MemoGather,
  ) {
    super(new Identifier(recorded.name), recorded.indentationDepth);
    markMemoized(this, memo);
    this.endsChooseBlock = recorded.endsChooseBlock;
  }

  /** What its generation does: the memo's record reported again (`memoGenerate`). */
  protected override Prepare(): boolean {
    memoGenerate(this);
    return true;
  }

  public override ResolveWith(_context: Story): void {
    memoResolve(this);
  }

  public override EmitProgram(_emitter: ProgramEmitter): void {
    throw new MemoizedStatementNeeded(this);
  }
}
