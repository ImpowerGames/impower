import { Expression } from "../Expression/Expression";
import { NumberExpression } from "../Expression/NumberExpression";
import { ObjectExpression } from "../Expression/ObjectExpression";
import { StringExpression } from "../Expression/StringExpression";
import { Identifier } from "../Identifier";
import { ParsedObject } from "../Object";
import { VariableReference } from "../Variable/VariableReference";

export class StructPropertyDefinition extends ParsedObject {
  override get typeName(): string {
    return "StructProperty";
  }

  get key(): string {
    return `.${this.identifier?.name ?? ""}`;
  }

  constructor(
    identifier: Identifier,
    public readonly expression: Expression | null = null,
  ) {
    super();
    this.identifier = identifier;
  }

  public readonly GetValue = (): unknown => {
    if (this.expression === null) {
      return undefined;
    }
    return this.ValueOf(this.expression, true);
  };

  private ValueOf(expression: Expression, report: boolean): unknown {
    const fail = (message: string): undefined => {
      if (report) {
        this.Error(message, expression);
      }
      return undefined;
    };
    if (expression instanceof NumberExpression) {
      return expression.value;
    }
    if (expression instanceof StringExpression) {
      if (!expression.isSingleString) {
        fail("Property strings cannot contain any logic.");
      }
      return expression.toString();
    }
    if (expression instanceof ObjectExpression) {
      const entries = expression.entries;
      if (
        entries.length > 0 &&
        entries.every((entry, i) => entry.key === String(i + 1))
      ) {
        return entries.map((entry) => this.ValueOf(entry.value, false));
      }
      const value: Record<string, unknown> = {};
      for (const entry of entries) {
        if (typeof entry.key === "string") {
          value[entry.key] = this.ValueOf(entry.value, false);
        }
      }
      return value;
    }
    if (expression instanceof VariableReference) {
      if (expression.path === null) {
        return fail("Property reference is invalid.");
      }
      if (expression.path.length === 1) {
        return { $type: "", $name: expression.path[0] || "" };
      }
      if (expression.path.length === 2) {
        return {
          $type: expression.path[0] || "",
          $name: expression.path[1] || "",
        };
      }
      if (expression.path.length > 2) {
        return fail("Property cannot reference another property.");
      }
    }
    return fail("Initial value must be a number, string, boolean, or reference");
  }

  protected override Prepare(): boolean {
    throw new Error("Not implemented.");
  }

  public override readonly toString = (): string => this.identifier?.name!;
}
