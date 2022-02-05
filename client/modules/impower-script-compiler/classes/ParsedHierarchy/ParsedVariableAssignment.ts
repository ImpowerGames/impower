import {
  Container,
  RuntimeObject,
  VariableAssignment,
} from "../../../impower-script-engine";
import { Identifier } from "../../types/Identifier";
import { IFlowBase } from "../../types/IFlowBase";
import { IStory } from "../../types/IStory";
import { IVariableAssignment } from "../../types/IVariableAssignment";
import { isVariableReference } from "../../types/IVariableReference";
import { SymbolType } from "../../types/SymbolType";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedListDefinition } from "./ParsedListDefinition";
import { ParsedObject } from "./ParsedObject";

export class ParsedVariableAssignment
  extends ParsedObject
  implements IVariableAssignment
{
  variableIdentifier: Identifier = null;

  expression: ParsedExpression = null;

  listDefinition: ParsedListDefinition = null;

  isGlobalDeclaration = false;

  isNewTemporaryDeclaration = false;

  private _runtimeAssignment: VariableAssignment = null;

  get variableName(): string {
    return this.variableIdentifier.name;
  }

  get isDeclaration(): boolean {
    return this.isGlobalDeclaration || this.isNewTemporaryDeclaration;
  }

  override get typeName(): string {
    if (this.isNewTemporaryDeclaration) {
      return "temp";
    }
    if (this.isGlobalDeclaration) {
      return "VAR";
    }
    return "variable assignment";
  }

  constructor(
    identifier: Identifier,
    assignedExpression: ParsedExpression,
    listDef?: ParsedListDefinition
  ) {
    super();
    this.variableIdentifier = identifier;

    // Defensive programming in case parsing of assignedExpression failed
    if (assignedExpression) {
      this.expression = this.AddContent(assignedExpression);
    }

    if (listDef !== undefined) {
      if (listDef) {
        this.listDefinition = this.AddContent(listDef);
        this.listDefinition.variableAssignment = this;
      }

      // List definitions are always global
      this.isGlobalDeclaration = true;
    }
  }

  override GenerateRuntimeObject(): RuntimeObject {
    let newDeclScope: IFlowBase = null;
    if (this.isGlobalDeclaration) {
      newDeclScope = this.story;
    } else if (this.isNewTemporaryDeclaration) {
      newDeclScope = this.ClosestFlowBase();
    }

    if (newDeclScope) newDeclScope.TryAddNewVariableDeclaration(this);

    // Global declarations don't generate actual procedural
    // runtime objects, but instead add a global variable to the story itself.
    // The story then initialises them all in one go at the start of the game.
    if (this.isGlobalDeclaration) return null;

    const container = new Container();

    // The expression's runtimeObject is actually another nested container
    if (this.expression != null)
      container.AddContent(this.expression.runtimeObject);
    else if (this.listDefinition != null)
      container.AddContent(this.listDefinition.runtimeObject);

    this._runtimeAssignment = new VariableAssignment(
      this.variableName,
      this.isNewTemporaryDeclaration
    );
    container.AddContent(this._runtimeAssignment);

    return container;
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    // List definitions are checked for conflicts separately
    if (this.isDeclaration && this.listDefinition == null)
      context.CheckForNamingCollisions(
        this,
        this.variableIdentifier,
        this.isGlobalDeclaration ? SymbolType.Var : SymbolType.Temp
      );

    // Initial VAR x = [intialValue] declaration, not re-assignment
    if (this.isGlobalDeclaration) {
      if (
        isVariableReference(this.expression) &&
        !this.expression.isConstantReference &&
        !this.expression.isListItemReference
      ) {
        this.Error(
          "global variable assignments cannot refer to other variables, only literal values, constants and list items"
        );
      }
    }

    if (!this.isNewTemporaryDeclaration) {
      const resolvedVarAssignment = context.ResolveVariableWithName(
        this.variableName,
        this
      );
      if (!resolvedVarAssignment.found) {
        if (this.story.constants[this.variableName] !== undefined) {
          this.Error(
            `Can't re-assign to a constant (do you need to use VAR when declaring '${this.variableName}'?)`,
            this
          );
        } else {
          this.Error(
            `Variable could not be found to assign to: '${this.variableName}'`,
            this
          );
        }
      }

      // A runtime assignment may not have been generated if it's the initial global declaration,
      // since these are hoisted out and handled specially in Story.ExportRuntime.
      if (this._runtimeAssignment != null)
        this._runtimeAssignment.isGlobal = resolvedVarAssignment.isGlobal;
    }
  }
}
