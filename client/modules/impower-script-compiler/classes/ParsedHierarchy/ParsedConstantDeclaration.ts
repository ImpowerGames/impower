import { RuntimeObject } from "../../../impower-script-engine";
import { Identifier } from "../../types/Identifier";
import { IStory } from "../../types/IStory";
import { SymbolType } from "../../types/SymbolType";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedObject } from "./ParsedObject";

export class ParsedConstantDeclaration extends ParsedObject {
  expression: ParsedExpression = null;

  constantIdentifier: Identifier = null;

  get constantName(): string {
    return this.constantIdentifier?.name;
  }

  override get typeName(): string {
    return "Constant";
  }

  constructor(name: Identifier, assignedExpression: ParsedExpression) {
    super();
    this.constantIdentifier = name;

    // Defensive programming in case parsing of assignedExpression failed
    if (assignedExpression)
      this.expression = this.AddContent(assignedExpression);
  }

  override GenerateRuntimeObject(): RuntimeObject {
    // Global declarations don't generate actual procedural
    // runtime objects, but instead add a global variable to the story itself.
    // The story then initialises them all in one go at the start of the game.
    return null;
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    context.CheckForNamingCollisions(
      this,
      this.constantIdentifier,
      SymbolType.Var
    );
  }
}
