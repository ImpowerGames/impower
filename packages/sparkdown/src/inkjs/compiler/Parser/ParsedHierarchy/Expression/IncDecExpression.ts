import { ContentList } from "../ContentList";
import { Expression } from "./Expression";
import { FlowBase } from "../Flow/FlowBase";
import { Story } from "../Story";
import { Weave } from "../Weave";
import { Identifier } from "../Identifier";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export class IncDecExpression extends Expression {
  // Whether preparation made the assignment; kept until the next
  // preparation.
  private _preparedAssignment = false;

  public isInc: boolean;
  public expression: Expression | null = null;

  constructor(
    identifier: Identifier | null,
    isIncOrExpression: boolean | Expression,
    isInc?: boolean,
  ) {
    super();

    this.identifier = identifier;

    if (isIncOrExpression instanceof Expression) {
      this.expression = isIncOrExpression;
      this.AddContent(this.expression);
      this.isInc = Boolean(isInc);
    } else {
      this.isInc = isIncOrExpression as boolean;
    }
  }

  override get typeName(): string {
    return "IncDecExpression";
  }

  public override PrepareIntoContainer(): void {
    this.expression?.PrepareIntoContainer();
    this._preparedAssignment = true;
  }

  // The variable, the step (the expression or 1), `+` or `-`, and the
  // variable written back.
  public override EmitExpression(emitter: ProgramEmitter): void {
    const name = emitter.variable(this.identifier?.name ?? "");
    emitter.emit(Op.GetVar, name);
    if (this.expression) {
      emitter.emitObject(this.expression);
    } else {
      emitter.emit(Op.Int, 1);
    }
    emitter.emit(Op.Native, emitter.string(this.isInc ? "+" : "-"), 2);
    emitter.emit(Op.SetVar, name);
  }

  public override ResolveWith(context: Story): void {
    super.ResolveWith(context);

    const varResolveResult = context.ResolveVariableWithName(
      this.identifier?.name || "",
      this,
    );

    if (!varResolveResult.found) {
      this.Error(
        `variable for ${this.incrementDecrementWord} could not be found`,
      );
    }

    if (!this._preparedAssignment) {
      throw new Error();
    }

    if (
      !(this.parent instanceof Weave) &&
      !(this.parent instanceof FlowBase) &&
      !(this.parent instanceof ContentList)
    ) {
      this.Error(`Can't use ${this.incrementDecrementWord} as sub-expression`);
    }
  }

  get incrementDecrementWord(): "increment" | "decrement" {
    if (this.isInc) {
      return "increment";
    }

    return "decrement";
  }

  public override readonly toString = (): string => {
    if (this.expression) {
      return `${this.identifier?.name}${this.isInc ? " += " : " -= "}${
        this.expression
      }`;
    }

    return `${this.identifier?.name}` + (this.isInc ? "++" : "--");
  };
}
