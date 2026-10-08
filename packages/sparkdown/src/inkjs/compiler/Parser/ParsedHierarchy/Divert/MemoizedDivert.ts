import { Divert as RuntimeDivert } from "../../../../engine/Divert";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Identifier } from "../Identifier";
import {
  markMemoized,
  memoGenerate,
  memoResolve,
  MemoizedStatementNeeded,
} from "../MemoizedStatement";
import type { Story } from "../Story";
import { Divert } from "./Divert";

/** What a statement's memo records of a divert the statement is (#656):
 *  its target's path and its kind, which the weave (whether a weave point
 *  runs on), the flow's checks and the writer read of it. */
export interface MemoDivert {
  readonly kind: "divert";
  readonly path: readonly string[];
  readonly isTunnel: boolean;
  readonly isThread: boolean;
  readonly isEmpty: boolean;
}

/** What a statement's memo records of the divert the statement lowered to,
 *  or null for one it cannot stand for: a call's, or one with arguments,
 *  whose expressions are objects of their own. */
export const memoDivertOf = (divert: Divert): MemoDivert | null => {
  if (divert.isFunctionCall || divert.args.length > 0) {
    return null;
  }
  const path = divert.pathIdentifiers?.map((id) => id.name) ?? [];
  if (path.some((name) => name == null)) {
    return null;
  }
  return {
    kind: "divert",
    path,
    isTunnel: divert.isTunnel,
    isThread: divert.isThread,
    isEmpty: divert.isEmpty,
  };
};

/**
 * A divert statement served from its memo (`MemoizedStatement`): a divert to
 * the same target, of the same kind, with no objects under it, built from
 * what the memo recorded (`MemoDivert`), whose generation and resolution go
 * through the memo.
 */
export class MemoizedDivert extends Divert {
  constructor(
    readonly memo: object,
    recorded: MemoDivert,
  ) {
    super(recorded.path.length > 0 ? recorded.path.map((name) => new Identifier(name)) : null);
    markMemoized(this, memo);
    this.isTunnel = recorded.isTunnel;
    this.isThread = recorded.isThread;
    this.isEmpty = recorded.isEmpty;
  }

  public override readonly GenerateRuntimeObject = () => {
    memoGenerate(this);
    const divert = new RuntimeDivert();
    this.runtimeDivert = divert;
    return divert;
  };

  public override ResolveWith(_context: Story, program: boolean): void {
    memoResolve(this, program);
  }

  public override EmitProgram(_emitter: ProgramEmitter): void {
    throw new MemoizedStatementNeeded(this);
  }
}
