import { Container as RuntimeContainer } from "../../../../engine/Container";
import type { InkObject as RuntimeObject } from "../../../../engine/Object";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Identifier } from "../Identifier";
import {
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
  };
};

/**
 * A label statement served from its memo (`MemoizedStatement`): a gather of
 * the same name and depth, holding nothing, built from what the memo
 * recorded (`MemoGather`), whose generation and resolution go through the
 * memo. Its generation still makes the container the weave places it by, as
 * a label's does.
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

  public override readonly GenerateRuntimeObject = (): RuntimeObject => {
    memoGenerate(this);
    const container = new RuntimeContainer();
    container.name = this.name;
    if (this.story.countAllVisits) {
      container.visitsShouldBeCounted = true;
    }
    container.countingAtStartOnly = true;
    return container;
  };

  public override ResolveWith(_context: Story, program: boolean): void {
    memoResolve(this, program);
  }

  public override EmitProgram(_emitter: ProgramEmitter): void {
    throw new MemoizedStatementNeeded(this);
  }
}
