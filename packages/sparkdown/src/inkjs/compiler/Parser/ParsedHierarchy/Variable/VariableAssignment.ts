import { Expression } from "../Expression/Expression";
import { FlowBase } from "../Flow/FlowBase";
import { ClosestFlowBase } from "../Flow/ClosestFlowBase";
import { ParsedObject } from "../Object";
import { Story } from "../Story";
import { SymbolType } from "../SymbolType";
import { VariableReference } from "./VariableReference";
import { Identifier } from "../Identifier";
import { asOrNull } from "../../../../../runtime/TypeAssertion";
import { StructDefinition } from "../Struct/StructDefinition";
import { currentCompileEpoch } from "../CompileEpoch";
import { resolutionTap } from "../ResolutionTap";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { NUMBERED_SYNTHETIC_NAME } from "../../../../../program/ProgramSymbols";
import {
  Op,
  SET_DECLARE,
  SET_INITIALIZE,
  SET_ROOT_SLOTTED,
} from "../../../../../program/ProgramInstructions";

export class VariableAssignment extends ParsedObject {
  // Whether preparation made the assignment a statement that runs (not a
  // global's declaration, which the story initializes). Kept across
  // compiles.
  private _madeAssignment = false;

  get variableName(): string {
    return this.identifier?.name!;
  }
  public readonly expression: Expression | null = null;
  public readonly structDefinition: StructDefinition | null = null;
  public readonly isGlobalDeclaration: boolean;
  public readonly isNewTemporaryDeclaration: boolean;
  public readonly isPropertyDeclaration: boolean;
  /** The assignment initializes the temporary the declaration just before
   *  it bound, as the second half of one declaration: a self-recursive
   *  `local function`'s closure, assigned after its name is declared nil so
   *  the body can call it (#1720). Its `SetVar` carries `SET_INITIALIZE`. */
  public readonly isDeclarationInitializer: boolean;
  /** For a `store`'s global whose value is the statement's last, a call or
   *  `...`, with names after it that have no value of their own: those
   *  names' declarations, in order, which the call's further values give
   *  values to as Luau's `local a, b = f()` does (#1920). The declaration's
   *  chunk evaluates the value once and declares this global and each of
   *  them from its values; their own expressions are never evaluated. */
  public spreadTo: readonly VariableAssignment[] = [];
  /** For a `store`'s last global, the statement's values after its last
   *  name: Luau evaluates them, in order, after the global's own value and
   *  drops them (#1333). The declaration's chunk evaluates each and pops
   *  its value before it declares the global. */
  public discarded: readonly Expression[] = [];

  /** Adopts the values the declaration evaluates and drops (`discarded`). */
  public Discard(expressions: readonly Expression[]): void {
    this.discarded = expressions.map((e) => this.AddContent(e) as Expression);
  }
  /** For a plain assignment, whether a `local` or parameter of its name
   *  certainly binds it where it is written (`FlowBase.IsBoundLocallyAt`),
   *  so that it writes that binding and not the global: decided when the
   *  program path's resolver shapes the statement that holds it
   *  (`ProgramResolver.decideWrites`), and kept while the statement is
   *  carried; null until decided (`Story.writesGlobal`). */
  public boundLocally: boolean | null = null;
  /** For a `local` of the root frame's own scope whose name the document
   *  declares there more than once, the slot that keeps its binding
   *  (`rootSlotName`): the declaration stores the cell of the binding it makes
   *  there, which a later declaration of the name closes on its value and
   *  leaves to the code written between them (I-1374). */
  public rootSlot: string | null = null;

  /** Stores the cell of the binding the declaration just made in its slot
   *  (`rootSlot`), when it has one. */
  public EmitRootSlot(emitter: ProgramEmitter): void {
    if (!this.rootSlot) return;
    emitter.emit(Op.VarPtr, emitter.variable(this.variableName));
    emitter.emit(Op.SetVar, emitter.variable(this.rootSlot), 0, SET_DECLARE);
  }
  // True for a `define`'s VariableAssignment (a runtime type/instance
  // table). Lets ParsedHierarchy/Story identify the full set of
  // defined type names when computing IMPLICIT parent types
  // (`as character` where `character` is never `define`d).
  public isDefineDeclaration: boolean = false;
  // True for the synthetic declaration minted per `const` so constants
  // participate in normal global initialization (see
  // `Story.RegisterConstantGlobals`). Constants used to be inlined into every
  // reference site instead of being initialized once.
  public isConstantDeclaration: boolean = false;

  /** Set by SparkdownCompiler's builtin-override pass on defines that came from
   *  the source-injected builtins prelude. It cannot be derived from
   *  `debugMetadata` — a prelude define and an authored one both carry null —
   *  and without it `AddNewVariableDeclaration` cannot tell "a project is
   *  overriding a builtin" (allowed) from "two authored defines collide"
   *  (an error). See {@link FlowBase.AddNewVariableDeclaration}. */
  public isPreludeDeclaration: boolean = false;

  // The compile epoch (see CompileEpoch.ts) in which the story refused this
  // global declaration because its name was already declared. A refused
  // declaration is never prepared, so its contents have nothing to resolve
  // against. Parsed nodes are reused across compiles, so the
  // refusal holds only for the compile that made it.
  private _refusedEpoch: number = 0;

  public RefuseAsDuplicate(): void {
    this._refusedEpoch = currentCompileEpoch();
  }

  get isRefusedAsDuplicate(): boolean {
    return this._refusedEpoch === currentCompileEpoch();
  }

  override get typeName() {
    if (this.isConstantDeclaration) {
      return "const";
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
    constantExpression,
    isGlobalDeclaration,
    isPropertyDeclaration,
    isTemporaryNewDeclaration,
    isDeclarationInitializer,
    isDefineDeclaration,
    structDef,
    variableIdentifier,
  }: {
    readonly assignedExpression?: Expression;
    /**
     * The expression of an existing `ConstantDeclaration`, adopted WITHOUT
     * `AddContent` — see the constructor body.
     */
    readonly constantExpression?: Expression;
    readonly isGlobalDeclaration?: boolean;
    readonly isPropertyDeclaration?: boolean;
    readonly isTemporaryNewDeclaration?: boolean;
    readonly isDeclarationInitializer?: boolean;
    readonly isDefineDeclaration?: boolean;
    readonly structDef?: StructDefinition;
    readonly variableIdentifier: Identifier;
  }) {
    super();

    this.identifier = variableIdentifier;
    this.isDefineDeclaration = Boolean(isDefineDeclaration);
    this.isGlobalDeclaration = Boolean(isGlobalDeclaration);
    this.isPropertyDeclaration = Boolean(isPropertyDeclaration);
    this.isNewTemporaryDeclaration = Boolean(isTemporaryNewDeclaration);
    this.isDeclarationInitializer = Boolean(isDeclarationInitializer);

    // Defensive programming in case parsing of assignedExpression failed
    if (structDef instanceof StructDefinition) {
      this.structDefinition = this.AddContent(structDef) as StructDefinition;
      this.structDefinition.variableAssignment = this;
      // Struct definitions are always global
      this.isGlobalDeclaration = true;
      // A `define` that's also an OOP type/instance carries BOTH the
      // struct registration (consumed by the engine's character / UI /
      // asset spec system, via `structDefinitions`) AND a runtime
      // table expression that initializes `D` as a live global table
      // (props + methods + inheritance) for in-script access. One
      // declaration, two behaviors — see the global initialization in
      // ParsedHierarchy/Story.
      if (assignedExpression) {
        this.expression = this.AddContent(assignedExpression) as Expression;
      }
    } else if (assignedExpression) {
      this.expression = this.AddContent(assignedExpression) as Expression;
    } else if (constantExpression) {
      // Adopted by DIRECT ASSIGNMENT, deliberately not `AddContent`.
      // `AddContent` REPARENTS its argument, which would move the expression
      // off its `ConstantDeclaration` and onto this synthetic node — and this
      // node is never added to the parse tree, so its own `parent` is null.
      // The expression's `story` getter (which walks parents to the root)
      // would then return this VariableAssignment instead of the Story, and
      // `Error()` would throw "No parent object to send error to" instead of
      // reporting a diagnostic. Sharing the expression is safe because it is
      // emitted exactly once, into the global initialization.
      this.expression = constantExpression;
      this.isConstantDeclaration = true;
      this.isGlobalDeclaration = true;
    }
  }

  // A global declaration runs nothing where it is written: its initializer
  // is a chunk of its script's declaration sequence, which the story runs
  // when its state is reset. Any other
  // assignment is its expression, then `SetVar`, which declares a temporary
  // for a `local` and otherwise assigns as `VariablesState.Assign` does; a
  // declaration's initializer is marked as one (`SET_INITIALIZE`).
  public override EmitProgram(emitter: ProgramEmitter): void {
    if (this.isGlobalDeclaration) {
      return;
    }
    emitter.recordResolution(this.resolutionKey);
    // Every assignment emitted here has its value: the lowerers leave out an
    // assignment whose value the parser could not read, and declare such a
    // local nil. The targets of a `MultiVariableAssignment` have no value of
    // their own and are never emitted here; it writes them itself.
    emitter.emitObject(this.expression!);
    emitter.emit(
      Op.SetVar,
      emitter.variable(this.variableName),
      0,
      (this.isNewTemporaryDeclaration ? SET_DECLARE : 0) |
        (this.isDeclarationInitializer ? SET_INITIALIZE : 0) |
        (this.rootSlot ? SET_ROOT_SLOTTED : 0),
    );
    this.EmitRootSlot(emitter);
  }

  /** How the assignment assigns its name, as a chunk records it: it declares
   *  a local, or assigns a variable already there. A statement's own text
   *  does not always say which: a function a function declares without
   *  `local` is assigned to the local its lowering hoisted to the top of the
   *  function around it, and declared where no function is around it. A name
   *  the compiler generates, which it numbers by document order, is recorded
   *  without its number. */
  get resolutionKey(): string {
    const name = NUMBERED_SYNTHETIC_NAME.test(this.variableName)
      ? "__synth"
      : this.variableName;
    return `set:${name}:${this.isNewTemporaryDeclaration ? "local" : "assign"}`;
  }

  /** Declares the assignment where its kind puts it: a global in the story,
   *  a `local` in the flow around it, and a plain assignment nowhere. The
   *  program path's resolver declares it again for a statement it does not
   *  prepare again (`ResolutionTap.declare`), since every compile declares
   *  the story's names anew. */
  public readonly RegisterDeclaration = (): void => {
    let newDeclScope: FlowBase | null | undefined = null;
    if (this.isGlobalDeclaration) {
      newDeclScope = this.story;
    } else if (this.isNewTemporaryDeclaration) {
      newDeclScope = ClosestFlowBase(this);
    }

    if (newDeclScope) {
      newDeclScope.AddNewVariableDeclaration(this);
    }
  };

  /** The declaration a global or a local makes, then the value's
   *  preparation for an assignment that runs. */
  protected override Prepare(): boolean {
    if (this.isGlobalDeclaration || this.isNewTemporaryDeclaration) {
      const tap = resolutionTap();
      if (tap) {
        tap.declare(this, this.RegisterDeclaration);
      } else {
        this.RegisterDeclaration();
      }
    }
    if (this.isGlobalDeclaration) {
      return false;
    }
    if (this.expression) {
      this.expression.prepare();
    }
    this._madeAssignment = true;
    return true;
  }

  public override ResolveWith(context: Story): void {
    // Resolving a refused declaration's contents would read what preparation
    // never made (a `define`'s `__def` call throws on its unprepared divert)
    // and end resolution for the rest of the story.
    if (!this.isRefusedAsDuplicate) {
      super.ResolveWith(context);
    }

    // Struct definitions are checked for conflicts separately
    if (
      this.isDeclaration &&
      !this.isPropertyDeclaration &&
      this.structDefinition === null
    ) {
      context.CheckForNamingCollisions(
        this,
        this.identifier!,
        this.isGlobalDeclaration ? SymbolType.Var : SymbolType.Temp,
      );
    }

    // Initial var x = [intialValue] declaration, not re-assignment
    if (this.isGlobalDeclaration) {
      const variableReference = asOrNull(this.expression, VariableReference);
      if (variableReference && !variableReference.isConstantReference) {
        this.Error(
          "A variable must be initialized to a number, string, boolean, constant, or divert target.",
          variableReference.diagnosticSource,
        );
      }
    }

    // Constants are immutable. This has to be checked OUTSIDE the
    // "unresolved name" branch below: constants are now registered in
    // `variableDeclarations`, so `ResolveVariableWithName` finds them and
    // that branch never runs for a constant. (The check that used to live
    // there was dead anyway — it tested `name in someMap`, which is always
    // false for a Map.) Without this, assigning to a constant silently
    // mutates it, and because the value then differs from its default it
    // would also start being written into save files.
    if (
      !this.isDeclaration &&
      !this.isConstantDeclaration &&
      this.story.constants.has(this.variableName) &&
      // Only when the name actually BINDS to the constant. A local or
      // parameter of the same name shadows it — that already reports its own
      // `Duplicate identifier`, and adding this on top would be misleading.
      this.story.variableDeclarations.get(this.variableName)
        ?.isConstantDeclaration
    ) {
      this.Error(
        `Cannot re-assign the const \`${this.variableName}\`.`,
        this.identifier,
      );
    }

    if (!this.isNewTemporaryDeclaration) {
      const resolvedVarAssignment = context.ResolveVariableWithName(
        this.variableName,
        this,
      );

      if (!resolvedVarAssignment.found) {
        // Luau auto-global semantics: a bare `x = expr` that doesn't
        // resolve to any local-in-scope or existing global becomes a
        // global creation at execution time. The runtime side handles
        // this in `VariablesState.Assign` (falls back to SetGlobal
        // when neither a local nor a global with this name exists),
        // so we just suppress the compile-time error here and let the
        // runtime auto-create the global.
        if (this._madeAssignment) {
          // Register the auto-global in the story's variable
          // declarations so downstream `Divert.ResolveTargetContent`
          // recognizes a later `x(args)` site as a variable-target
          // (closure-call) rather than a missing flow. Without this,
          // `Y = function...; Y(F)` errors with "target not found
          // -> Y" even though the runtime can dispatch on Y's value.
          // Subsequent `x = ...` re-assignments take the resolved
          // branch above (since `x` is now declared) — no risk of
          // duplicate-identifier diagnostics from this registration.
          const tap = resolutionTap();
          if (tap) {
            tap.autoGlobal(this, this.RegisterAutoGlobal);
          } else {
            this.RegisterAutoGlobal();
          }
        }
      }
    }
  }

  /** Makes a global of the assignment's name, as a bare assignment that no
   *  name resolved does where resolution reaches it. The program path's
   *  resolver makes it again for a statement it does not resolve again
   *  (`ResolutionTap.autoGlobal`), while the name is still undeclared there:
   *  the story's names are declared anew every compile, in the order a cold
   *  compile reaches their declarations. */
  public readonly RegisterAutoGlobal = (): void => {
    this.story.variableDeclarations.set(this.variableName, this);
  };

  public override readonly toString = (): string =>
    `${
      this.isGlobalDeclaration
        ? "var"
        : this.isNewTemporaryDeclaration
          ? "~ temp"
          : ""
    } ${this.variableName}`;
}
