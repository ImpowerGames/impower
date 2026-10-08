import { Expression } from "../Expression/Expression";
import { FlowBase } from "../Flow/FlowBase";
import { ParsedObject } from "../Object";
import { Path } from "../Path";
import { Story } from "../Story";
import { Identifier } from "../Identifier";
import { asOrNull, filterUndef } from "../../../../../runtime/TypeAssertion";
import {
  isStdLibFunctionName,
  isStdLibNamespaceName,
  lookupStdLibConstant,
} from "../../../../../runtime/StdLib";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export class VariableReference extends Expression {
  // - Normal variables have a single item in their "path"
  // - Knot/stitch names for read counts are actual dot-separated paths
  //   (though this isn't actually used at time of writing)
  // - List names are dot separated: listName.itemName (or just itemName)
  get name() {
    return this.path.join(".");
  }

  get path(): string[] {
    return this.pathIdentifiers.map((id) => id.name!).filter(filterUndef);
  }

  /**
   * Derived, not a preparation-time flag: constants are known before any
   * preparation runs, and a stored flag would be STICKY across compiles.
   * An incremental compile reuses a flow without preparing it again, so a
   * reference that was constant when it was last prepared would keep
   * claiming so after the constant is deleted — silently suppressing the
   * `Cannot find variable named` warning a cold compile emits.
   */
  get isConstantReference(): boolean {
    return this.story.constants.has(this.name);
  }
  // Only known after PrepareIntoContainer has run
  public isListItemReference: boolean = false;

  /**
   * What the name resolved to when references were last resolved: a
   * variable (or constant, or a dotted read through a variable's table), a
   * flow's read count, a function (a function value), or nothing (a nil
   * read). The binary program's writer emits a variable read for all but
   * the count and the function, and the chunk store emits the reading
   * statement again when the answer changes.
   */
  public resolvedAs: "variable" | "count" | "function" | "unresolved" =
    "unresolved";

  /** The scene, branch or label whose count the name reads, when it
   *  resolved to a count. */
  public countTarget: ParsedObject | null = null;

  // The member a colon call reads from this reference, as in `table:nogetn()`.
  // When set, an unresolved name reports the member path (`table.nogetn`)
  // across both names, as the dot form's path reference does. The compiler
  // rebases its position with the reference's other identifiers.
  public unresolvedMember: Identifier | null = null;

  // Whether the reference was prepared since its last `ResetRuntime`.
  private _preparedReference = false;
  get isReferencePrepared(): boolean {
    return this._preparedReference;
  }

  constructor(public readonly pathIdentifiers: Identifier[]) {
    super();
    this.identifier = new Identifier(...this.pathIdentifiers);
  }

  override get typeName(): string {
    return "ref";
  }

  /** The story's constants read, and a list item looked up. */
  public override PrepareIntoContainer(): void {
    this._preparedReference = true;
    if (this.story.constants.has(this.name)) {
      return;
    }
    if (this.path.length === 1 || this.path.length === 2) {
      let listItemName: string = "";
      let listName: string = "";
      if (this.path.length === 1) {
        listItemName = this.path[0]!;
      } else {
        listName = this.path[0]!;
        listItemName = this.path[1]!;
      }
      const listItem = this.story.ResolveListItem(listName, listItemName, this);
      if (listItem) {
        this.isListItemReference = true;
      }
    }
  }

  public override ResolveWith(context: Story): void {
    super.ResolveWith(context);

    // Work is already done if it's a constant or list item reference
    this.resolvedAs = "variable";
    this.countTarget = null;
    if (this.isConstantReference || this.isListItemReference) {
      return;
    }

    {
      const struct = context.ResolveStruct(this.name);
      if (
        this.IsResolvedVariable(context) &&
        // Plain variable, OR a `define` that carries a runtime table
        // (its VariableAssignment has an expression) — those ARE
        // first-class runtime values (`companion`,
        // `instances(companion)`, `c: companion`). Only pure data
        // structs / builtin specs with no runtime table remain
        // non-referenceable as bare values (legacy behavior).
        (!struct || struct.variableAssignment?.expression != null)
      ) {
        return;
      }
    }
    this.resolvedAs = "unresolved";

    // Is it a read count?
    const parsedPath = new Path(this.pathIdentifiers);
    const targetForCount: ParsedObject | null =
      parsedPath.ResolveFromContext(this);
    if (targetForCount) {
      // Lua-style first-class fn fallback: when the name resolves to
      // a FUNCTION knot, the reference reads the function as a value. So
      // `local f = double` works without requiring `local f = -> double`.
      //
      // The legacy ink convention of `myKnot` resolving to its read
      // count still applies for NON-function knots (regular labelled
      // sections, choices, etc.) so existing narrative scripts that
      // gate on visit counts via bare names keep working.
      let targetFlow = asOrNull(targetForCount, FlowBase);
      if (targetFlow && targetFlow.isFunction) {
        this.resolvedAs = "function";
        return;
      }

      // The program reads the count of the target's symbol (`GetCount`),
      // which every counted symbol keeps.
      this.resolvedAs = "count";
      this.countTarget = targetForCount;
      return;
    }

    // Couldn't find this multi-part path at all, whether as a divert target,
    // or list item reference.
    if (this.path.length > 1) {
      // Last chance: maybe this is property access on a table-typed
      // variable (sparkdown extension — `result.value` where `result`
      // is a stored table). If the FIRST segment resolves as a variable
      // (arg / temp / global), treat the remaining segments as key
      // lookups. The runtime side (`Story.ts > VariableReference`
      // branch) handles the actual indexing — see the
      // "property-access via dotted name" comment there.
      const baseName = this.path[0];
      if (baseName) {
        const baseResolve = context.ResolveVariableWithName(baseName, this);
        const baseStruct = context.ResolveStruct(baseName);
        if (
          baseResolve.found &&
          this.IsFoundNameInScope(baseName, context) &&
          !context.constants.has(baseName) &&
          // `companion.O` — the base is a `define` runtime table, so
          // the dotted access walks it at runtime. Pure data structs
          // (no runtime table) stay blocked as before.
          (!baseStruct || baseStruct.variableAssignment?.expression != null)
        ) {
          // Variable-with-property-access — no compile-time error.
          this.resolvedAs = "variable";
          return;
        }
      }

      this.ReportUnresolvedPath(this.path, this.diagnosticSource);
      return;
    }

    if (!this.IsResolvedVariable(context)) {
      if (this.unresolvedMember) {
        this.ReportUnresolvedPath(
          [this.name, this.unresolvedMember.name],
          new Identifier(this.identifier!, this.unresolvedMember),
        );
        return;
      }
      // Luau-superset semantics: undefined names resolve to `nil` at
      // runtime, not a compile error. Downgraded to a warning so it
      // still surfaces in the IDE as a probable typo / forgotten
      // declaration. The runtime falls back to `NullValue` (see
      // Story.PerformLogicAndFlowControl's variable-reference branch).
      this.Error(
        `Cannot find variable named \`${this.name}\``,
        this.diagnosticSource,
        true,
      );
    }
  }

  // A local named like a library (`local table = {...}`) is found from
  // anywhere in its flow, but it only shadows the library inside its scope.
  private IsFoundNameInScope(name: string, context: Story): boolean {
    return !isStdLibNamespaceName(name) || context.IsLocalInScope(name, this);
  }

  // Whether the name reads a variable. The receiver of a colon call on a
  // library (`table:nogetn()`) reads a same-named local only where it is in
  // scope.
  private IsResolvedVariable(context: Story): boolean {
    return (
      context.ResolveVariableWithName(this.name, this).found &&
      (this.unresolvedMember === null ||
        this.IsFoundNameInScope(this.name, context))
    );
  }

  // An unresolved dotted path: `table.nogetn`, or the `table:nogetn()` a colon
  // call reads from its receiver.
  private ReportUnresolvedPath(
    path: string[],
    source: ParsedObject | Identifier,
  ): void {
    const pathStr = path.join(".");

    // `math.pi()`: a call through a registered stdlib constant. The path
    // exists, so it is not reported; the call fails at run time. A library
    // function read where no local shadows its library (`table.concat`
    // before `local table`) exists too.
    if (
      lookupStdLibConstant(pathStr) !== undefined ||
      isStdLibFunctionName(pathStr)
    ) {
      return;
    }

    // Luau-superset semantics: same logic as the single-name
    // "Cannot find variable named" diagnostic in `ResolveWith` — downgrade
    // unresolved dotted paths to a warning so the runtime can fall
    // back to `NullValue` for property reads (`_G.bar`,
    // `unknown.field`, ...). The diagnostic still surfaces in the
    // IDE as a probable typo / forgotten declaration.
    this.Error(`Cannot find item or path named \`${pathStr}\``, source, true);
  }

  // Where a diagnostic about this reference is reported: the name or path
  // itself when the lowerer gave its names positions (merged into
  // `identifier` by the constructor), otherwise the nearest position up the
  // parent chain.
  public get diagnosticSource(): ParsedObject | Identifier {
    return this.identifier?.debugMetadata ? this.identifier : this;
  }

  // A variable read, with `VariableReference`'s runtime fallbacks (a dotted
  // name walked through tables, `_G`, a function's name as its value, a
  // builtin's marker, nil). A name that reads a scene's, a branch's or a
  // label's count reads the count of its symbol (`GetCount`), which every
  // counted symbol keeps, so no fact about the target is recorded and a read
  // added in one flow emits nothing of the flow it counts
  // (docs/engine/binary-program.md, section 5).
  public override EmitExpression(emitter: ProgramEmitter): void {
    if (this.isListItemReference) {
      emitter.unsupported("list");
    }
    emitter.recordResolution(this.resolutionKey);
    if (this.resolvedAs === "count") {
      const symbol = emitter.targetSymbol(this.countTarget, this.name);
      emitter.referenceTarget(symbol);
      emitter.emit(Op.GetCount, symbol);
      return;
    }
    emitter.emit(Op.GetVar, emitter.variable(this.name));
  }

  /** The name and what it resolved to, as a chunk records it: for a count,
   *  the symbol whose count it reads. A name the compiler generated, which it
   *  numbers by document order, is recorded without its number, since the
   *  chunk names it by its own. */
  get resolutionKey(): string {
    const name = /^__synth_\d+$/.test(this.name) ? "__synth" : this.name;
    if (this.resolvedAs === "count") {
      return `${name}:count:${this.countTarget?.programSymbolName ?? ""}`;
    }
    return `${name}:${this.resolvedAs}`;
  }

  public override readonly toString = (): string => `{${this.path.join(".")}}`;

  override OnResetRuntime(): void {
    this._preparedReference = false;
  }
}
