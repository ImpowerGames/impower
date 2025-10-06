import { Container as RuntimeContainer } from "../../../../engine/Container";
import { Expression } from "../Expression/Expression";
import { FlowBase } from "../Flow/FlowBase";
import { ClosestFlowBase } from "../Flow/ClosestFlowBase";
import { ListDefinition } from "../List/ListDefinition";
import { ParsedObject } from "../Object";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { Story } from "../Story";
import { SymbolType } from "../SymbolType";
import { VariableAssignment as RuntimeVariableAssignment } from "../../../../engine/VariableAssignment";
import { VariableReference } from "./VariableReference";
import { Identifier } from "../Identifier";
import { asOrNull } from "../../../../engine/TypeAssertion";
import { StructDefinition } from "../Struct/StructDefinition"

export class VariableAssignment extends ParsedObject {
  private _runtimeAssignment: RuntimeVariableAssignment | null = null;

  get variableName(): string {
    return this.variableIdentifier.name!;
  }
  public readonly variableIdentifier: Identifier;
  public readonly expression: Expression | null = null;
  public readonly listDefinition: ListDefinition | null = null;
  public readonly structDefinition: StructDefinition | null = null;
  public readonly isGlobalDeclaration: boolean;
  public readonly isNewTemporaryDeclaration: boolean;
  public readonly isPropertyDeclaration: boolean;

  override get typeName() {
    if (this.listDefinition !== null) {
      return "list";
    } else if (this.structDefinition !== null) {
      return "define";
    } else if (this.isNewTemporaryDeclaration) {
      return "temp";
    } else if (this.isGlobalDeclaration) {
      return "var";
    } else if (this.isPropertyDeclaration) {
      return "property";
    }

    return "variable assignment";
  }

  get isDeclaration(): boolean {
    return (
      this.isGlobalDeclaration ||
      this.isPropertyDeclaration ||
      this.isNewTemporaryDeclaration
    );
  }

  constructor({
    assignedExpression,
    isGlobalDeclaration,
    isPropertyDeclaration,
    isTemporaryNewDeclaration,
    listDef,
    structDef,
    variableIdentifier,
  }: {
    readonly assignedExpression?: Expression;
    readonly isGlobalDeclaration?: boolean;
    readonly isPropertyDeclaration?: boolean;
    readonly isTemporaryNewDeclaration?: boolean;
    readonly listDef?: ListDefinition;
    readonly structDef?: StructDefinition;
    readonly variableIdentifier: Identifier;
  }) {
    super();

    this.variableIdentifier = variableIdentifier;
    this.isGlobalDeclaration = Boolean(isGlobalDeclaration);
    this.isPropertyDeclaration = Boolean(isPropertyDeclaration);
    this.isNewTemporaryDeclaration = Boolean(isTemporaryNewDeclaration);

    // Defensive programming in case parsing of assignedExpression failed
    if (listDef instanceof ListDefinition) {
      this.listDefinition = this.AddContent(listDef) as ListDefinition;
      this.listDefinition.variableAssignment = this;
      // List definitions are always global
      this.isGlobalDeclaration = true;
    } else if (structDef instanceof StructDefinition) {
      this.structDefinition = this.AddContent(structDef) as StructDefinition;
      this.structDefinition.variableAssignment = this;
      // Struct definitions are always global
      this.isGlobalDeclaration = true;
    } else if (assignedExpression) {
      this.expression = this.AddContent(assignedExpression) as Expression;
    }
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject | null => {
    let newDeclScope: FlowBase | null | undefined = null;
    if (this.isGlobalDeclaration) {
      newDeclScope = this.story;
    } else if (this.isNewTemporaryDeclaration) {
      newDeclScope = ClosestFlowBase(this);
    }

    if (newDeclScope) {
      newDeclScope.AddNewVariableDeclaration(this);
    }

    // Global declarations don't generate actual procedural
    // runtime objects, but instead add a global variable to the story itself.
    // The story then initialises them all in one go at the start of the game.
    if (this.isGlobalDeclaration) {
      return null;
    }

    const container = new RuntimeContainer();

    // The expression's runtimeObject is actually another nested container
    if (this.expression) {
      container.AddContent(this.expression.runtimeObject);
    } else if (this.listDefinition) {
      container.AddContent(this.listDefinition.runtimeObject);
    }

    this._runtimeAssignment = new RuntimeVariableAssignment(
      this.variableName,
      this.isNewTemporaryDeclaration
    );

    container.AddContent(this._runtimeAssignment);

    return container;
  };

  public ResolveReferences(context: Story): void {
    super.ResolveReferences(context);

    // List and struct definitions are checked for conflicts separately
    if (
      this.isDeclaration &&
      !this.isPropertyDeclaration &&
      this.listDefinition === null &&
      this.structDefinition === null
    ) {
      context.CheckForNamingCollisions(
        this,
        this.variableIdentifier,
        this.isGlobalDeclaration ? SymbolType.Var : SymbolType.Temp
      );
    }

    // Initial var x = [intialValue] declaration, not re-assignment
    if (this.isGlobalDeclaration) {
      const variableReference = asOrNull(this.expression, VariableReference);
      if (
        variableReference &&
        !variableReference.isConstantReference &&
        !variableReference.isListItemReference
      ) {
        this.Error(
          "A variable must be initialized to a number, string, boolean, constant, list item, or divert target."
        );
      }
    }

    if (!this.isNewTemporaryDeclaration) {
      const resolvedVarAssignment = context.ResolveVariableWithName(
        this.variableName,
        this
      );

      if (!resolvedVarAssignment.found) {
        if (this.variableName in this.story.constants) {
          this.Error(`Cannot re-assign a const variable`, this);
        } else {
          this.Error(
            `Cannot find variable named '${this.variableName}'`,
            this.variableIdentifier
          );
        }
      }

      // A runtime assignment may not have been generated if it's the initial global declaration,
      // since these are hoisted out and handled specially in Story.ExportRuntime.
      if (this._runtimeAssignment) {
        this._runtimeAssignment.isGlobal = resolvedVarAssignment.isGlobal;
      }
    }
  }

  public readonly toString = (): string =>
    `${
      this.isGlobalDeclaration
        ? "var"
        : this.isNewTemporaryDeclaration
        ? "~ temp"
        : ""
    } ${this.variableName}`;
}
