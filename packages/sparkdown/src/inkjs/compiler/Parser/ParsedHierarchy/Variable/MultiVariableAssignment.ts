import { Expression } from "../Expression/Expression";
import { Identifier } from "../Identifier";
import { ParsedObject } from "../Object";
import { VariableAssignment } from "./VariableAssignment";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op, SET_DECLARE } from "../../../../../program/ProgramInstructions";

// Lua/Luau multi-target assignment: `local a, b, c = expr1, expr2, …`.
//
// Both single-RHS (`local a, b = f()`) and multi-RHS (`local a, b = 10, 20`)
// route through this class. For single-RHS, the pack is skipped — the
// single expression's multiple value (if any) goes straight to the unpack,
// which already knows how to spread.
//
// Each child `VariableAssignment` is constructed with no expression; the
// children handle their own `AddNewVariableDeclaration` registration with
// the closest `FlowBase`.
//
// Only local (temporary) declarations are supported. Global
// multi-target (`store a, b = ...`) is left to a follow-up because
// globals register at the story level.
export class MultiVariableAssignment extends ParsedObject {
  public expressions: Expression[];
  public targetAssignments: VariableAssignment[];

  constructor(
    targets: Identifier[],
    expressions: Expression[],
    isTemporaryNewDeclaration: boolean,
  ) {
    super();
    this.expressions = expressions.map(
      (e) => this.AddContent(e) as Expression,
    );
    this.targetAssignments = targets.map(
      (id) =>
        this.AddContent(
          new VariableAssignment({
            variableIdentifier: id,
            isTemporaryNewDeclaration,
          }),
        ) as VariableAssignment,
    );
  }

  override get typeName(): string {
    return "MultiVariableAssignment";
  }

  // The values, packed when there are several, unpacked to one per target,
  // and each target assigned in order, as its own assignment records it
  // (`VariableAssignment.resolutionKey`).
  public override EmitProgram(emitter: ProgramEmitter): void {
    for (const expr of this.expressions) {
      emitter.emitObject(expr);
    }
    if (this.expressions.length > 1) {
      emitter.emit(Op.Pack, this.expressions.length);
    }
    emitter.emit(Op.Unpack, this.targetAssignments.length);
    for (const target of this.targetAssignments) {
      if (target.isGlobalDeclaration) {
        emitter.unsupported("global multiple assignment");
      }
      emitter.recordResolution(target.resolutionKey);
      emitter.emit(
        Op.SetVar,
        emitter.variable(target.variableName),
        0,
        target.isNewTemporaryDeclaration ? SET_DECLARE : 0,
      );
    }
  }

  protected override Prepare(): boolean {
    for (const expr of this.expressions) {
      expr.prepare();
    }
    for (const va of this.targetAssignments) {
      va.prepare();
    }
    return true;
  }
}
