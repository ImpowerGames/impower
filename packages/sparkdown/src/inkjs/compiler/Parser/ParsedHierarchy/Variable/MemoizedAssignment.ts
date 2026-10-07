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
import { VariableAssignment } from "./VariableAssignment";

/** What a statement's memo records of a plain assignment the statement is
 *  (#656): the name it assigns, which the story's passes over the whole
 *  program read of it (`Story.globalAssignmentNames`, what the resolver
 *  signs a bare assignment's name by) and an auto-global it makes. */
export interface MemoAssignment {
  readonly kind: "assignment";
  readonly name: string;
}

/** What a statement's memo records of the assignment the statement lowered
 *  to, or null for one it cannot stand for: a declaration of any kind,
 *  which the story declares (a global, a local, a property, a constant's
 *  global, a list's or a `define`'s). */
export const memoAssignmentOf = (assignment: VariableAssignment): MemoAssignment | null => {
  if (
    assignment.isDeclaration ||
    assignment.isDefineDeclaration ||
    assignment.isConstantDeclaration ||
    assignment.listDefinition !== null ||
    assignment.structDefinition !== null ||
    assignment.variableName == null
  ) {
    return null;
  }
  return { kind: "assignment", name: assignment.variableName };
};

/**
 * A plain assignment statement served from its memo (`MemoizedStatement`):
 * an assignment of the same name with no expression, built from what the
 * memo recorded (`MemoAssignment`), whose generation and resolution go
 * through the memo, which makes the auto-global the assignment made again
 * (`ProgramResolver.repeatMemo`).
 */
export class MemoizedAssignment extends VariableAssignment {
  constructor(
    readonly memo: object,
    recorded: MemoAssignment,
  ) {
    super({ variableIdentifier: new Identifier(recorded.name) });
    markMemoized(this, memo);
  }

  public override readonly GenerateRuntimeObject = (): RuntimeObject | null => {
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
