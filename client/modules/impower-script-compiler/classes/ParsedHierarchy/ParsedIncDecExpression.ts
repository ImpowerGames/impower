import {
  Container,
  IntValue,
  NativeFunctionCall,
  VariableAssignment,
  VariableReference,
} from "../../../impower-script-engine";
import { isContentList } from "../../types/IContentList";
import { Identifier } from "../../types/Identifier";
import { isFlowBase } from "../../types/IFlowBase";
import { IStory } from "../../types/IStory";
import { isWeave } from "../../types/IWeave";
import { ParsedExpression } from "./ParsedExpression";

export class ParsedIncDecExpression extends ParsedExpression {
  varIdentifier: Identifier = null;

  expression: ParsedExpression = null;

  isInc = false;

  private _runtimeAssignment: VariableAssignment = null;

  private get incrementDecrementWord(): string {
    if (this.isInc) return "increment";
    return "decrement";
  }

  constructor(
    varIdentifier: Identifier,
    isInc: boolean,
    expression?: ParsedExpression
  ) {
    super();
    this.varIdentifier = varIdentifier;
    this.isInc = isInc;
    if (expression) {
      this.expression = expression;
      this.AddContent(expression);
    }
  }

  override GenerateIntoContainer(container: Container): void {
    // x = x + y
    // ^^^ ^ ^ ^
    //  4  1 3 2
    // Reverse polish notation: (x 1 +) (assign to x)

    // 1.
    container.AddContent(new VariableReference(this.varIdentifier?.name));

    // 2.
    // - Expression used in the form ~ x += y
    // - Simple version: ~ x++
    if (this.expression) this.expression.GenerateIntoContainer(container);
    else container.AddContent(new IntValue(1));

    // 3.
    container.AddContent(
      NativeFunctionCall.CallWithName(this.isInc ? "+" : "-")
    );

    // 4.
    this._runtimeAssignment = new VariableAssignment(
      this.varIdentifier?.name,
      false
    );
    container.AddContent(this._runtimeAssignment);
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    const varResolveResult = context.ResolveVariableWithName(
      this.varIdentifier?.name,
      this
    );
    if (!varResolveResult.found) {
      this.Error(
        `variable for ${this.incrementDecrementWord} could not be found: '${this.varIdentifier}' after searching: ${this.descriptionOfScope}`
      );
    }

    this._runtimeAssignment.isGlobal = varResolveResult.isGlobal;

    if (
      !isWeave(this.parent) &&
      !isFlowBase(this.parent) &&
      !isContentList(this.parent)
    ) {
      this.Error(`Can't use ${this.incrementDecrementWord} as sub-expression`);
    }
  }

  override ToString(): string {
    if (this.expression)
      return (
        this.varIdentifier +
        (this.isInc ? " += " : " -= ") +
        this.expression.ToString()
      );
    return this.varIdentifier + (this.isInc ? "++" : "--");
  }
}
