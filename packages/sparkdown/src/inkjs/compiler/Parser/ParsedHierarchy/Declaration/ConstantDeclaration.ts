import { Expression } from "../Expression/Expression";
import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { Story } from "../Story";
import { SymbolType } from "../SymbolType";
import { Identifier } from "../Identifier";
import { VariableReference } from "../Variable/VariableReference";

export class ConstantDeclaration extends ParsedObject {
  get constantName(): string | undefined {
    return this.identifier?.name;
  }

  private _expression: Expression | null = null;

  get expression(): Expression {
    if (!this._expression) {
      throw new Error();
    }

    return this._expression;
  }

  constructor(name: Identifier, assignedExpression: Expression) {
    super();

    this.identifier = name;

    // Defensive programming in case parsing of assignedExpression failed
    if (assignedExpression) {
      this._expression = this.AddContent(assignedExpression) as Expression;
    }
  }

  get typeName(): string {
    return "const";
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject | null => {
    // Global declarations don't generate actual procedural
    // runtime objects, but instead add a global variable to the story itself.
    // The story then initialises them all in one go at the start of the game.
    return null;
  };

  public override ResolveReferences(context: Story) {
    super.ResolveReferences(context);
    context.CheckForNamingCollisions(this, this.identifier, SymbolType.Var);

    // A constant is initialized before every mutable global, so it can only be
    // built from other constants — reading a `store` here would see nil. This
    // used to fail as a silent whole-program compile failure instead.
    for (const name of context.NonConstantInitializerRefs(this)) {
      this.Error(
        `A const must be initialized to a constant expression; \`${name}\` is not a const.`,
        this.identifier,
      );
    }

    // Reading a constant that itself couldn't be registered (cycle member, or
    // transitively invalid) is the same failure one step removed. Reporting
    // it here means every member of a bad chain gets a diagnostic instead of
    // only the one where the problem was first detected.
    const invalidRefs = this.expression
      .FindAll(VariableReference)()
      .map((ref) => ref.name)
      .filter(
        (name): name is string =>
          Boolean(name) &&
          name !== this.constantName &&
          context.unregisterableConstants.has(name!),
      );
    for (const name of invalidRefs) {
      this.Error(
        `A const must be initialized to a constant expression; \`${name}\` is not a valid const.`,
        this.identifier,
      );
    }
  }
}
