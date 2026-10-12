import { Expression } from "../Expression/Expression";
import { ParsedObject } from "../Object";
import { Story } from "../Story";
import { SymbolType } from "../SymbolType";
import { Identifier } from "../Identifier";
import { VariableReference } from "../Variable/VariableReference";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";

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

  override get typeName(): string {
    return "const";
  }

  private _references: VariableReference[] | null = null;

  /** The names its initializer reads, in the order a walk of the
   *  initializer finds them. A constant's syntax does not change once it is
   *  lowered, so the initializer is walked once, however many compiles carry
   *  it (the program path's resolver visits no object of a statement it
   *  carries); a name is read from its reference each time, as the walk
   *  read it. */
  get referencedNames(): string[] {
    this._references ??= this.expression.FindAll(VariableReference)();
    const names: string[] = [];
    for (const ref of this._references) {
      if (ref.name) {
        names.push(ref.name);
      }
    }
    return names;
  }

  // A constant runs nothing where it is written; it initializes with the
  // globals (see `VariableAssignment.EmitProgram`).
  public override EmitProgram(_emitter: ProgramEmitter): void {}

  /** Nothing: the constant's initializer is written with the globals. */
  protected override Prepare(): boolean {
    return false;
  }

  public override ResolveWith(context: Story) {
    super.ResolveWith(context);
    context.CheckForNamingCollisions(this, this.identifier!, SymbolType.Var);

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
    const invalidRefs = this.referencedNames.filter(
      (name) =>
        name !== this.constantName && context.unregisterableConstants.has(name),
    );
    for (const name of invalidRefs) {
      this.Error(
        `A const must be initialized to a constant expression; \`${name}\` is not a valid const.`,
        this.identifier,
      );
    }
  }
}
