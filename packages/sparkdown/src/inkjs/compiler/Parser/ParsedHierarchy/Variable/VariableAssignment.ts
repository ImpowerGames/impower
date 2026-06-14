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
import { StructDefinition } from "../Struct/StructDefinition";

export class VariableAssignment extends ParsedObject {
  private _runtimeAssignment: RuntimeVariableAssignment | null = null;

  get variableName(): string {
    return this.identifier?.name!;
  }
  public readonly expression: Expression | null = null;
  public readonly listDefinition: ListDefinition | null = null;
  public readonly structDefinition: StructDefinition | null = null;
  public readonly isGlobalDeclaration: boolean;
  public readonly isNewTemporaryDeclaration: boolean;
  public readonly isPropertyDeclaration: boolean;
  // True for a `define`'s VariableAssignment (a runtime type/instance
  // table). Lets ParsedHierarchy/Story identify the full set of
  // defined type names when computing IMPLICIT parent types
  // (`as character` where `character` is never `define`d).
  public isDefineDeclaration: boolean = false;

  // Set when this is a same-name different-type define that lost the
  // global-name slot to an earlier define (e.g. `define raffles as synth`
  // after `define raffles as character`). Its struct still reaches the
  // engine type-namespaced via the lowerer's `context` emission, but its
  // runtime table is suppressed: it's NOT added to `variableDeclarations`,
  // so its `__def(...)` expression is never generated into a runtime
  // container — which means its inner `-> __def` divert never gets a
  // `runtimeDivert`. Skipping its `ResolveReferences` avoids the
  // `runtimeDivert` getter throwing mid-pass (which would abort reference
  // resolution for everything after it — e.g. leaving later choices'
  // return-target paths null and crashing serialization). See
  // FlowBase.AddNewVariableDeclaration.
  public isSuppressedDuplicateDefine: boolean = false;

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
    isDefineDeclaration,
    listDef,
    structDef,
    variableIdentifier,
  }: {
    readonly assignedExpression?: Expression;
    readonly isGlobalDeclaration?: boolean;
    readonly isPropertyDeclaration?: boolean;
    readonly isTemporaryNewDeclaration?: boolean;
    readonly isDefineDeclaration?: boolean;
    readonly listDef?: ListDefinition;
    readonly structDef?: StructDefinition;
    readonly variableIdentifier: Identifier;
  }) {
    super();

    this.identifier = variableIdentifier;
    this.isDefineDeclaration = Boolean(isDefineDeclaration);
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
      // A `define` that's also an OOP type/instance carries BOTH the
      // struct registration (consumed by the engine's character / UI /
      // asset spec system, via `structDefinitions`) AND a runtime
      // table expression that initializes `D` as a live global table
      // (props + methods + inheritance) for in-script access. One
      // declaration, two behaviors — see the init handling in
      // ParsedHierarchy/Story's ExportRuntime.
      if (assignedExpression) {
        this.expression = this.AddContent(assignedExpression) as Expression;
      }
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
      this.isNewTemporaryDeclaration,
    );

    container.AddContent(this._runtimeAssignment);

    return container;
  };

  public override ResolveReferences(context: Story): void {
    // A suppressed duplicate define has no generated runtime expression,
    // so resolving its children (the `__def(...)` call → `-> __def` divert)
    // would throw on the never-set `runtimeDivert` and abort the entire
    // resolve pass. It contributes only its type-namespaced struct (already
    // emitted via the lowerer's `context`), so there's nothing here to
    // resolve. See isSuppressedDuplicateDefine.
    if (this.isSuppressedDuplicateDefine) {
      return;
    }

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
        this.identifier,
        this.isGlobalDeclaration ? SymbolType.Var : SymbolType.Temp,
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
          "A variable must be initialized to a number, string, boolean, constant, list item, or divert target.",
        );
      }
    }

    if (!this.isNewTemporaryDeclaration) {
      const resolvedVarAssignment = context.ResolveVariableWithName(
        this.variableName,
        this,
      );

      if (!resolvedVarAssignment.found) {
        if (this.variableName in this.story.constants) {
          this.Error(`Cannot re-assign a const variable`, this);
        }
        // Luau auto-global semantics: a bare `x = expr` that doesn't
        // resolve to any local-in-scope or existing global becomes a
        // global creation at execution time. The runtime side handles
        // this in `VariablesState.Assign` (falls back to SetGlobal
        // when neither a local nor a global with this name exists),
        // so we just suppress the compile-time error here and let the
        // runtime auto-create the global. Mark the runtime assignment
        // as global so the dispatcher routes correctly.
        else if (this._runtimeAssignment) {
          this._runtimeAssignment.isGlobal = true;
          // ALSO register the auto-global in the story's variable
          // declarations so downstream `Divert.ResolveTargetContent`
          // recognizes a later `x(args)` site as a variable-target
          // (closure-call) rather than a missing flow. Without this,
          // `Y = function...; Y(F)` errors with "target not found
          // -> Y" even though the runtime can dispatch on Y's value.
          // Subsequent `x = ...` re-assignments take the resolved
          // branch above (since `x` is now declared) — no risk of
          // duplicate-identifier diagnostics from this registration.
          this.story.variableDeclarations.set(this.variableName, this);
        }
      } else if (this._runtimeAssignment) {
        // A runtime assignment may not have been generated if it's the
        // initial global declaration, since these are hoisted out and
        // handled specially in Story.ExportRuntime.
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
