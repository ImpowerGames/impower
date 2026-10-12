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
import { MultiVariableAssignment } from "./MultiVariableAssignment";
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
/** What a statement's memo records of an assignment of several names the
 *  statement is (`local a, b = 1, 2`, `a, b = b, a`): each name and where
 *  it stands relative to the statement, and whether they are locals. */
export interface MemoMultiAssignment {
  readonly kind: "multi";
  readonly names: readonly string[];
  readonly local: boolean;
  readonly at: readonly (MemoPosition | null)[];
}

/** What a statement's memo records of the assignment of several names the
 *  statement lowered to, or null for one whose names it cannot read. */
export const memoMultiOf = (assignment: MultiVariableAssignment): MemoMultiAssignment | null => {
  const targets = assignment.targetAssignments;
  if (targets.length === 0 || targets.some((target) => memoAssignmentOf(target) === null && !target.isNewTemporaryDeclaration)) {
    return null;
  }
  const local = targets[0]!.isNewTemporaryDeclaration;
  if (targets.some((target) => target.isNewTemporaryDeclaration !== local || target.variableName == null)) {
    return null;
  }
  const own = assignment.ownDebugMetadata;
  return {
    kind: "multi",
    names: targets.map((target) => target.variableName),
    local,
    at: targets.map((target) => {
      const name = target.identifier?.debugMetadata;
      return own && name
        ? {
            line: name.startLineNumber - own.startLineNumber,
            endLine: name.endLineNumber - own.startLineNumber,
            start: name.startCharacterNumber,
            end: name.endCharacterNumber,
          }
        : null;
    }),
  };
};

/**
 * An assignment of several names served from its memo: the same names, of
 * the same kind, with no expressions, built from what the memo recorded
 * (`MemoMultiAssignment`), whose generation and resolution go through the
 * memo, which declares again the locals its targets declared and makes again
 * the auto-globals they made (`ProgramResolver.repeatMemo`).
 */
export class MemoizedMultiAssignment extends MultiVariableAssignment {
  constructor(
    readonly memo: object,
    recorded: MemoMultiAssignment,
  ) {
    super(
      recorded.names.map((name) => new Identifier(name)),
      [],
      recorded.local,
    );
    markMemoized(this, memo);
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
