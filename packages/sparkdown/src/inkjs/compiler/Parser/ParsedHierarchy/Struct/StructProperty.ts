import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { Identifier } from "../Identifier";
import { Expression } from "../Expression/Expression";
import { NumberExpression } from "../Expression/NumberExpression";
import { StringExpression } from "../Expression/StringExpression";
import { VariableReference } from "../Variable/VariableReference";

export class StructProperty extends ParsedObject {
  override get typeName(): string {
    return "StructProperty";
  }

  constructor(
    public readonly level: number,
    public readonly identifier: Identifier,
    public readonly expression: Expression | null = null
  ) {
    super();
  }

  public readonly GetValue = (): unknown => {
    if (this.expression === null) {
      return undefined;
    }
    if (this.expression instanceof NumberExpression) {
      return this.expression.value;
    }
    if (this.expression instanceof StringExpression) {
      if (!this.expression.isSingleString) {
        this.Error(
          "Property strings cannot contain any logic.",
          this.expression
        );
      }
      return this.expression.toString();
    }
    if (this.expression instanceof VariableReference) {
      if (this.expression.path === null) {
        this.Error("Property reference is invalid.", this.expression);
        return undefined;
      }
      if (this.expression.path.length > 2) {
        this.Error(
          "Property cannot reference another property.",
          this.expression
        );
        return undefined;
      }
      if (this.expression.path.length === 1) {
        return { $type: "", $name: this.expression.path[0] || "" };
      }
      return {
        $type: this.expression.path[0] || "",
        $name: this.expression.path[1] || "",
      };
    }
    this.Error(
      "Initial value must be a number, string, boolean, or reference",
      this.expression
    );
    return undefined;
  };

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    throw new Error("Not implemented.");
  };

  public override readonly toString = (): string => this.identifier.name;
}
