import { Container as RuntimeContainer } from "../../../../engine/Container";
import type { InkObject as RuntimeObject } from "../../../../engine/Object";
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
import { VariableAssignment } from "./VariableAssignment";

/** What a statement's memo records of a plain assignment the statement is
 *  (#656): the name it assigns, which the story's passes over the whole
 *  program read of it (`Story.globalAssignmentNames`, what the resolver
 *  signs a bare assignment's name by) and an auto-global it makes. */
export interface MemoAssignment {
  readonly kind: "assignment";
  readonly name: string;
  /** Whether it declares a local (`local x = 1`), which the flow around it
   *  holds for the statements after it. */
  readonly local: boolean;
  /** Where its name stands relative to it. */
  readonly at: MemoPosition | null;
}

/** What a statement's memo records of the assignment the statement lowered
 *  to, or null for one it cannot stand for: a declaration the story
 *  declares for the whole program (a global, a property, a constant's
 *  global, a list's or a `define`'s). A local declaration it stands for:
 *  its stand-in declares the local again. */
export const memoAssignmentOf = (assignment: VariableAssignment): MemoAssignment | null => {
  if (
    assignment.isGlobalDeclaration ||
    assignment.isPropertyDeclaration ||
    assignment.isDefineDeclaration ||
    assignment.isConstantDeclaration ||
    assignment.listDefinition !== null ||
    assignment.structDefinition !== null ||
    assignment.variableName == null
  ) {
    return null;
  }
  return {
    kind: "assignment",
    name: assignment.variableName,
    local: assignment.isNewTemporaryDeclaration,
    at: namePosition(assignment),
  };
};

/**
 * A plain assignment or local declaration served from its memo
 * (`MemoizedStatement`): an assignment of the same name and kind with no
 * expression, built from what the memo recorded (`MemoAssignment`), whose
 * generation and resolution go through the memo, which makes the
 * auto-global the assignment made again and declares the local the
 * declaration declared (`ProgramResolver.repeatMemo`).
 */
export class MemoizedAssignment extends VariableAssignment {
  constructor(
    readonly memo: object,
    recorded: MemoAssignment,
  ) {
    super({
      variableIdentifier: new Identifier(recorded.name),
      isTemporaryNewDeclaration: recorded.local,
    });
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
