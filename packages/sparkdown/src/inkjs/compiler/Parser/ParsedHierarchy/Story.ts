import { AuthorWarning } from "./AuthorWarning";
import { bumpCompileEpoch } from "./CompileEpoch";
import { ConstantDeclaration } from "./Declaration/ConstantDeclaration";
import { Container as RuntimeContainer } from "../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../engine/ControlCommand";
import type { ErrorHandler } from "../../../engine/Error";
import { ErrorType } from "../ErrorType";
import { ExternalDeclaration } from "./Declaration/ExternalDeclaration";
import { FlowBase } from "./Flow/FlowBase";
import { FlowLevel } from "./Flow/FlowLevel";
import { IncludedFile } from "./IncludedFile";
import { ListDefinition } from "./List/ListDefinition";
import { ListElementDefinition } from "./List/ListElementDefinition";
import { StructDefinition } from "./Struct/StructDefinition";
import { ParsedObject } from "./Object";
import { Story as RuntimeStory } from "../../../engine/Story";
import { SymbolType } from "./SymbolType";
import { Text } from "./Text";
import { VariableAssignment as RuntimeVariableAssignment } from "../../../engine/VariableAssignment";
import { ListDefinition as RuntimeListDefinition } from "../../../engine/ListDefinition";
import { StructDefinition as RuntimeStructDefinition } from "../../../engine/StructDefinition";
import { Identifier } from "./Identifier";
import { asOrNull } from "../../../engine/TypeAssertion";
import { ClosestFlowBase } from "./Flow/ClosestFlowBase";
import { FunctionCall } from "./FunctionCall";
import { Path } from "./Path";
import { VariableAssignment } from "./Variable/VariableAssignment";
import { DebugMetadata } from "../../../engine/DebugMetadata";
import { Stitch } from "./Stitch";
import { ObjectExpression } from "./Expression/ObjectExpression";
import { VariableReference } from "./Variable/VariableReference";

export class Story extends FlowBase {
  public static readonly IsReservedKeyword = (name?: string): boolean => {
    switch (name) {
      case "true":
      case "false":
      case "not":
      case "return":
      case "else":
      case "temp":
      case "INCLUDE":
      case "include":
      case "EXTERNAL":
      case "external":
      case "VAR":
      case "var":
      case "store":
      case "CONST":
      case "const":
      // `LIST` / `list` are intentionally NOT reserved — sparkdown
      // replaced ink's LIST type with Luau tables (see
      // docs/runtime/DIVERGENCES.md), so the words are free for user identifiers
      // (`store list = {…}`, `function list_all() end`, etc.).
      case "DEFINE":
      case "define":
      case "function":
      case "system":
      case "scene":
      case "branch":
        return true;
    }

    return false;
  };

  private _errorHandler: ErrorHandler | null = null;
  private _hadError: boolean = false;
  private _hadWarning: boolean = false;
  private _listDefs: Map<string, ListDefinition> = new Map();
  private _structDefs: Map<string, StructDefinition> = new Map();

  // True while `ExportRuntime` is materializing runtime objects (generation),
  // false during the later `ResolveReferences` pass. Diagnostics raised during
  // GENERATION are attributed to their enclosing top-level flow below — the
  // incremental compiler skips generation for unchanged flows, which would
  // silently drop such a diagnostic on the next compile, so any flow that
  // produced one is barred from reuse (resolve-time diagnostics re-emit
  // naturally because resolution always runs over the full tree).
  private _generationPhase: boolean = false;

  // Top-level flows that raised a diagnostic during generation this export,
  // plus a flag for diagnostics that couldn't be attributed to one (no parsed
  // source or no top-level ancestor) — the compiler reacts by disabling flow
  // reuse entirely for the next compile.
  public flowsWithGenerationDiagnostics: Set<ParsedObject> = new Set();
  public hadUnattributableGenerationDiagnostic: boolean = false;

  get flowLevel(): FlowLevel {
    return FlowLevel.Story;
  }

  get hadError(): boolean {
    return this._hadError;
  }

  get hadWarning(): boolean {
    return this._hadWarning;
  }

  public constants: Map<string, ConstantDeclaration> = new Map();
  public externals: Map<string, ExternalDeclaration> = new Map();

  /** Declare the bare globals the builtins prelude creates at runtime (its
   *  type roots), without initializing them here. A compile that does not
   *  seed the prelude into the story (the editor's diagnostics compiler)
   *  still has every builtin table at runtime, because every host seeds it;
   *  without these markers a reference such as `game.loading.percent`
   *  reports "Cannot find item or path" in the editor and nowhere else.
   *
   *  Runs before ExportRuntime, so the markers are always the incumbents when
   *  the program's own declarations register during generation. An authored
   *  define of the same name then takes the slot outright and the marker is
   *  dropped; an authored `store` or `const` of that name is reported as a
   *  duplicate identifier, as it is in a seeded compile (see
   *  FlowBase.AddNewVariableDeclaration).
   *
   *  `names` must hold only names the seeded runtime really has: a marker
   *  captures every `-> name` divert as a variable divert, exactly as the
   *  real global does in a seeded compile, so a name that is not a runtime
   *  global would make a same-named scene unreachable. The compiler reports
   *  each divert so captured, and each top-level scene or function that
   *  shares a real global's name
   *  (SparkdownCompiler.reportBuiltinGlobalCollisions). */
  public DeclareBuiltinGlobals(names: Iterable<string>): void {
    const declared = new Set<string>();
    for (const name of names) {
      if (!name) {
        continue;
      }
      declared.add(name);
      const va = new VariableAssignment({
        variableIdentifier: new Identifier(name),
        isGlobalDeclaration: true,
        isDefineDeclaration: true,
      });
      va.isPreludeDeclaration = true;
      this.AddNewVariableDeclaration(va);
    }
    this.builtinGlobalNames = declared;
  }

  /** The names {@link DeclareBuiltinGlobals} declared for this compile. */
  public builtinGlobalNames: ReadonlySet<string> = new Set();

  /** Diverts whose target resolved, during ResolveReferences, to a global
   *  named in {@link builtinGlobalNames}: `-> game` binds to the builtin's
   *  variable (a table at runtime, whether the prelude's own or an authored
   *  override), so it can never reach a scene, branch, or label of that
   *  name and fails when run. The compiler reports each one
   *  (SparkdownCompiler.reportBuiltinGlobalCollisions). */
  public builtinGlobalDiverts: { name: string; divert: ParsedObject }[] = [];

  // Build setting for exporting:
  // When true, the visit count for *all* knots, stitches, choices,
  // and gathers is counted. When false, only those that are direclty
  // referenced by the ink are recorded. Use this flag to allow game-side
  // querying of  arbitrary knots/stitches etc.
  // Storing all counts is more robust and future proof (updates to the story file
  // that reference previously uncounted visits are possible, but generates a much
  // larger safe file, with a lot of potentially redundant counts.
  public countAllVisits: boolean = false;

  constructor(toplevelObjects: ParsedObject[], isInclude: boolean = false) {
    // Don't do anything much on construction, leave it lightweight until
    // the ExportRuntime method is called.
    super(null, toplevelObjects, null, false, isInclude);
  }

  override get typeName(): string {
    return "Story";
  }

  // Before this function is called, we have IncludedFile objects interspersed
  // in our content wherever an include statement was.
  // So that the include statement can be added in a sensible place (e.g. the
  // top of the file) without side-effects of jumping into a knot that was
  // defined in that include, we separate knots and stitches from anything
  // else defined at the top scope of the included file.
  //
  // Algorithm: For each IncludedFile we find, split its contents into
  // knots/stiches and any other content. Insert the normal content wherever
  // the include statement was, and append the knots/stitches to the very
  // end of the main story.
  public override PreProcessTopLevelObjects(
    topLevelContent: ParsedObject[],
  ): void {
    super.PreProcessTopLevelObjects(topLevelContent);

    const flowsFromOtherFiles: ParsedObject[] = [];

    // Inject included files. Use an index-based loop instead of `for ... of`
    // so we can re-process the position after splicing in the included
    // file's content. If the included file's content starts with another
    // `IncludedFile` (the nested-include case — `main.ink` → `a.ink` →
    // `b.ink`), a naive `for ... of` would skip over it because the
    // iterator already advanced past the original position before the
    // splice inserted new items there. Restarting the index at `i` after
    // splicing means we re-visit the now-inserted child IncludedFile and
    // recursively process it.
    for (let i = 0; i < topLevelContent.length; i++) {
      const obj = topLevelContent[i]!;
      if (obj instanceof IncludedFile) {
        const file: IncludedFile = obj;

        // Remove the IncludedFile itself
        topLevelContent.splice(i, 1);

        // When an included story fails to load, the include
        // line itself is still valid, so we have to handle it here
        if (file.includedStory) {
          const nonFlowContent: ParsedObject[] = [];
          const subStory = file.includedStory;
          // Allow empty file
          if (subStory.content != null) {
            for (const subStoryObj of subStory.content) {
              if (subStoryObj instanceof FlowBase) {
                flowsFromOtherFiles.push(subStoryObj);
              } else {
                nonFlowContent.push(subStoryObj);
              }
            }

            // Add newline on the end of the include
            nonFlowContent.push(new Text("\n"));

            // Add contents of the file in its place
            topLevelContent.splice(i, 0, ...nonFlowContent);
          }
        }

        // Re-visit position `i`: if the first spliced-in item is itself
        // an `IncludedFile` (nested include), the next loop iteration
        // will process it. The `i--` cancels out the loop's `i++` so we
        // examine the same index again.
        i--;
        continue;
      }
    }

    // Add the flows we collected from the included files to the
    // end of our list of our content
    topLevelContent.splice(0, 0, ...flowsFromOtherFiles);
  }

  public readonly ExportRuntime = (
    errorHandler: ErrorHandler | null = null,
  ): RuntimeStory | null => {
    this._errorHandler = errorHandler;

    // Invalidate every node's diagnostic-dedup state from prior exports in
    // O(1) — the incremental pipeline reuses parsed nodes across compiles, and
    // a stale "already had warning" flag would silently drop a diagnostic a
    // cold compile emits (see CompileEpoch.ts).
    bumpCompileEpoch();

    // Collect constants, list definitions and struct definitions in a single
    // top-down traversal instead of three separate full-tree `FindAll` passes.
    // CollectByType preserves FindAll's depth-first pre-order per type, so each
    // bucket is identical to the corresponding FindAll result.
    const constDecls: ConstantDeclaration[] = [];
    const listDecls: ListDefinition[] = [];
    const structDecls: StructDefinition[] = [];
    this.CollectByType(
      [ConstantDeclaration, ListDefinition, StructDefinition],
      [constDecls, listDecls, structDecls] as ParsedObject[][],
    );

    // Find all constants before main export begins, so that VariableReferences know
    // whether to generate a runtime variable reference or the literal value
    this.constants = new Map();
    for (const constDecl of constDecls) {
      // Check for duplicate definitions
      const existingDefinition = this.constants.get(constDecl.constantName!);

      if (existingDefinition) {
        if (!existingDefinition.expression.Equals(constDecl.expression)) {
          const errorMsg = `Cannot redeclare const \`${constDecl.constantName}\` with a different value. (It is already declared on ${existingDefinition.debugMetadata})`;
          this.Error(errorMsg, constDecl, false);
        }
      }

      this.constants.set(constDecl.constantName!, constDecl);
    }

    // Constants are ordinary runtime globals: each gets a synthetic
    // declaration registered here, BEFORE any generation runs, so that
    // `variableDeclarations` (an insertion-ordered Map, which the global-init
    // container is emitted from) lists every constant ahead of every
    // store/define. That ordering is what lets `store B = SOME_CONST` work
    // regardless of the order they appear in the source.
    //
    // They used to be inlined into each reference site instead, which made
    // ordering irrelevant but copied the constant's whole runtime-object
    // graph per reference — and threw outright for any initializer
    // containing an operator, because `NativeFunctionCall` has no `Copy()`.
    this.unregisterableConstants = new Set<string>();
    this.RegisterConstantGlobals();

    // List definitions are treated like constants too - they should be usable
    // from other variable declarations.
    this._listDefs = new Map();
    for (const listDef of listDecls) {
      if (listDef.identifier?.name) {
        this._listDefs.set(listDef.identifier?.name, listDef);
      }
    }

    // Struct definitions are treated like constants too - they should be usable
    // from other variable declarations.
    this._structDefs = new Map();
    const runtimeStructs: RuntimeStructDefinition[] = [];
    for (const structDef of structDecls) {
      if (structDef.identifier?.name) {
        this._structDefs.set(structDef.identifier?.name, structDef);
        runtimeStructs.push(structDef.runtimeStructDefinition);
        // When the define ALSO carries a runtime table expression (the
        // OOP type/instance path), the live table provides each
        // property — emitting flat `companion.O.name` globals too would
        // shadow the table with a stale snapshot after any mutation
        // (`GetVariableWithName` matches the flat dotted key before
        // falling back to the table walk). So only emit the flat
        // property globals for pure data structs with no runtime table.
        if (
          !structDef.modifier?.name &&
          structDef.name?.name !== "$default" &&
          !structDef.variableAssignment?.expression
        ) {
          // Each struct property should be saved as its own dot-accessible variable
          for (const prop of structDef.propertyDefinitions) {
            if (
              prop.expression &&
              !(prop.expression instanceof ObjectExpression) &&
              !(prop.expression instanceof VariableReference)
            ) {
              const variableIdentifier = new Identifier(
                structDef.key + prop.key,
              );
              variableIdentifier.debugMetadata = prop.debugMetadata;
              const variableDeclaration = new VariableAssignment({
                assignedExpression: prop.expression,
                isGlobalDeclaration: true,
                isPropertyDeclaration: true,
                variableIdentifier,
              });
              this.AddNewVariableDeclaration(variableDeclaration);
            }
          }
        }
      }
    }

    this.externals = new Map();

    // Resolution of weave point names has to come first, before any runtime code generation
    // since names have to be ready before diverts start getting created.
    // (It used to be done in the constructor for a weave, but didn't allow us to generate
    // errors when name resolution failed.)
    this.ResolveWeavePointNaming();

    // Everything from here until `ResolveReferences` is GENERATION — see
    // `_generationPhase`. Diagnostics raised in this window are attributed to
    // their top-level flow so the incremental compiler can bar that flow from
    // reuse (reuse skips generation, which would drop the diagnostic).
    this._generationPhase = true;
    this.flowsWithGenerationDiagnostics = new Set();
    this.hadUnattributableGenerationDiagnostic = false;
    this.builtinGlobalDiverts = [];

    // Get default implementation of runtimeObject, which calls ContainerBase's generation method
    const rootContainer = this.runtimeObject as RuntimeContainer;

    // IMPLICIT parent types — a `define X as T` whose parent `T` is
    // never itself `define`d (e.g. `as character`, a builtin engine
    // type). Register the name as a known global so bare `T` references
    // (`instances(character)`, `character.O`) resolve without a
    // "Cannot find variable" warning. No runtime init is emitted: the
    // child define's `__def` lazily mints the parent table during
    // global-init (and members register into it), so the table always
    // exists by the time content runs.
    const definedTypeNames = new Set<string>();
    for (const [k, v] of this.variableDeclarations) {
      if (v.isDefineDeclaration) {
        definedTypeNames.add(k);
      }
    }
    const implicitParentNames = new Set<string>();
    // Reuse the struct bucket collected above (same parsed nodes — the tree
    // gains no StructDefinitions between collection and here).
    for (const structDef of structDecls) {
      const parentName = structDef.type?.name;
      if (
        parentName &&
        !definedTypeNames.has(parentName) &&
        !this.variableDeclarations.has(parentName)
      ) {
        implicitParentNames.add(parentName);
      }
    }
    for (const parentName of implicitParentNames) {
      // Declaration-only marker (no expression → never reaches the
      // init loop's "must have expression" path; skipped explicitly
      // below). Exists purely so `ResolveVariableWithName` succeeds.
      const va = new VariableAssignment({
        variableIdentifier: new Identifier(parentName),
        isGlobalDeclaration: true,
        isDefineDeclaration: true,
      });
      this.AddNewVariableDeclaration(va);
    }

    // Export initialisation of global variables
    // TODO: We *could* add this as a declarative block to the story itself...
    const variableInitialization = new RuntimeContainer();
    variableInitialization.AddContent(RuntimeControlCommand.EvalStart());

    // Global variables are those that are local to the story and marked as global
    const runtimeLists: RuntimeListDefinition[] = [];
    for (const [key, value] of this.variableDeclarations) {
      // Implicit parents are declaration-only (lazily minted by a
      // child's `__def` at runtime), as are the builtin markers of an
      // unseeded compile (DeclareBuiltinGlobals) — nothing to initialize
      // here. A marker is recognized by shape rather than by key so it is
      // skipped under whatever key it ends up holding.
      if (
        implicitParentNames.has(key) ||
        (value.isPreludeDeclaration &&
          !value.expression &&
          !value.structDefinition &&
          !value.listDefinition)
      ) {
        continue;
      }
      if (value.isGlobalDeclaration) {
        if (value.listDefinition) {
          this._listDefs.set(key, value.listDefinition);
          runtimeLists.push(value.listDefinition.runtimeListDefinition);
          variableInitialization.AddContent(
            value.listDefinition.runtimeObject!,
          );
        } else {
          // Struct registration — populates `structDefinitions` for the
          // engine's character / UI / asset spec system. A `define` can
          // carry this AND a runtime table expression simultaneously
          // (see VariableAssignment); the struct half never serializes
          // and is compile-time only.
          if (value.structDefinition) {
            this._structDefs.set(key, value.structDefinition);
            runtimeStructs.push(value.structDefinition.runtimeStructDefinition);
          }
          // Runtime initialization — for ordinary globals AND for
          // `define` tables (which additionally carry a struct above).
          // A pure struct VA (no expression) is intentionally NOT
          // initialized at runtime, matching the legacy behavior.
          if (value.expression) {
            value.expression.GenerateIntoContainer(variableInitialization);
            const runtimeVarAss = new RuntimeVariableAssignment(key, true);
            runtimeVarAss.isGlobal = true;
            variableInitialization.AddContent(runtimeVarAss);
          } else if (!value.structDefinition) {
            // Non-struct global declaration must have an expression.
            throw new Error();
          }
        }
      }
    }

    variableInitialization.AddContent(RuntimeControlCommand.EvalEnd());
    variableInitialization.AddContent(RuntimeControlCommand.End());

    if (this.variableDeclarations.size > 0) {
      variableInitialization.name = "global decl";
      rootContainer.AddToNamedContentOnly(variableInitialization);
    }

    // Signal that it's safe to exit without error, even if there are no choices generated
    // (this only happens at the end of top level content that isn't in any particular knot)
    rootContainer.AddContent(RuntimeControlCommand.Done());

    // Replace runtimeObject with Story object instead of the Runtime.Container generated by Parsed.ContainerBase
    const runtimeStory = new RuntimeStory(
      rootContainer,
      runtimeLists,
      runtimeStructs,
    );

    // Publish the constant names so the runtime can keep them read-only and
    // out of save data while still exposing them as inspectable globals.
    // Only the ones actually registered: a constant that failed validation
    // has no initializer in `global decl`, so it is not a global at all.
    for (const [name] of this.constants) {
      if (this.variableDeclarations.get(name)?.isConstantDeclaration) {
        runtimeStory.constantNames.add(name);
      }
    }

    this.runtimeObject = runtimeStory;

    // Generation is complete (FlattenContainersIn emits no diagnostics).
    this._generationPhase = false;

    // Optimisation step - inline containers that can be
    this.FlattenContainersIn(rootContainer);

    // Now that the story has been fulled parsed into a hierarchy,
    // and the derived runtime hierarchy has been built, we can
    // resolve referenced symbols such as variables and paths.
    // e.g. for paths " -> knotName --> stitchName" into an INKPath (knotName.stitchName)
    // We don't make any assumptions that the INKPath follows the same
    // conventions as the script format, so we resolve to actual objects before
    // translating into an INKPath. (This also allows us to choose whether
    // we want the paths to be absolute)
    try {
      this.ResolveReferences(this);
    } catch (e) {
      console.error(e);
    }

    runtimeStory.ResetState();

    return runtimeStory;
  };

  /**
   * Register one synthetic global declaration per constant, ordered so that a
   * constant always precedes any constant that references it.
   *
   * Iterates `this.constants` rather than the raw declaration list so a
   * duplicated name registers once (the duplicate is already diagnosed where
   * the map is built). A dependency cycle is reported and the members fall
   * back to source order, so the compile still produces a program.
   */
  /**
   * Names a constant's initializer reads that are NOT themselves constants.
   *
   * A constant may only be built from other constants: constants are
   * initialized ahead of every mutable global, so reading a `store` here would
   * see nil. Such a constant is neither registered nor initialized (the nil
   * arithmetic would throw out of `ResetState` and cost the whole program its
   * bytecode), and `ConstantDeclaration.ResolveReferences` reports it.
   */
  /**
   * Constants that could NOT be registered as globals — built from a
   * non-constant, part of a dependency cycle, or reading one of those. They
   * emit no initializer, so their references read nil; each is reported by
   * `ConstantDeclaration.ResolveReferences`.
   */
  public unregisterableConstants: Set<string> = new Set<string>();

  public readonly NonConstantInitializerRefs = (
    constDecl: ConstantDeclaration,
  ): string[] =>
    constDecl.expression
      .FindAll(VariableReference)()
      .map((ref) => ref.name)
      .filter(
        (name): name is string =>
          Boolean(name) && !this.constants.has(name!),
      );

  protected readonly RegisterConstantGlobals = (): void => {
    const visited = new Set<string>();
    const onStack = new Set<string>();

    const visit = (name: string): void => {
      if (visited.has(name)) {
        return;
      }
      const constDecl = this.constants.get(name);
      if (!constDecl) {
        return;
      }
      if (onStack.has(name)) {
        this.Error(
          `Circular constant definition: \`${name}\` depends on itself.`,
          constDecl,
          false,
        );
        // Poison EVERY member of the cycle, not just the name we re-entered:
        // registering any of them emits an initializer that reads one of the
        // others before it exists, and the resulting nil arithmetic throws
        // out of `ResetState`, costing the whole program its bytecode.
        for (const member of onStack) {
          this.unregisterableConstants.add(member);
        }
        return;
      }
      onStack.add(name);
      // Emit every constant this one reads first, so its initializer sees a
      // value rather than nil. A self-reference is deliberately NOT filtered
      // out here — walking it is what lets `onStack` detect it.
      const refs = constDecl.expression.FindAll(VariableReference)();
      for (const ref of refs) {
        if (ref.name && this.constants.has(ref.name)) {
          visit(ref.name);
        }
      }
      onStack.delete(name);
      visited.add(name);

      // Not registerable if it is built from a non-constant, is a cycle
      // member, or reads a constant that itself failed — each case would
      // otherwise emit an initializer reading an uninitialized global.
      // Dependencies are visited above, so their verdicts are already known.
      const readsUnregisterable = refs.some(
        (ref) => ref.name && this.unregisterableConstants.has(ref.name),
      );
      if (
        this.unregisterableConstants.has(name) ||
        readsUnregisterable ||
        this.NonConstantInitializerRefs(constDecl).length > 0
      ) {
        this.unregisterableConstants.add(name);
        return;
      }

      const declaration = new VariableAssignment({
        variableIdentifier: constDecl.identifier!,
        constantExpression: constDecl.expression,
      });
      this.AddNewVariableDeclaration(declaration);
    };

    for (const name of this.constants.keys()) {
      visit(name);
    }
  };

  public readonly ResolveStruct = (
    structName: string,
  ): StructDefinition | null => {
    let struct: StructDefinition | null | undefined =
      this._structDefs.get(structName);
    if (!struct) {
      return null;
    }

    return struct;
  };

  public readonly ResolveList = (listName: string): ListDefinition | null => {
    let list: ListDefinition | null | undefined = this._listDefs.get(listName);
    if (!list) {
      return null;
    }

    return list;
  };

  public readonly ResolveListItem = (
    listName: string | null,
    itemName: string,
    source: ParsedObject | null = null,
  ): ListElementDefinition | null => {
    let listDef: ListDefinition | null | undefined = null;

    // Search a specific list if we know its name (i.e. the form listName.itemName)
    if (listName) {
      if (!(listDef = this._listDefs.get(listName))) {
        return null;
      }

      return listDef.ItemNamed(itemName);
    } else {
      // Otherwise, try to search all lists

      let foundItem: ListElementDefinition | null = null;
      let originalFoundList: ListDefinition | null = null;

      for (const [, value] of this._listDefs.entries()) {
        const itemInThisList = value.ItemNamed(itemName);
        if (itemInThisList) {
          if (foundItem) {
            this.Error(
              `Ambiguous item name \`${itemName}\` found in multiple sets, including ${
                originalFoundList!.identifier
              } and ${value!.identifier}`,
              source,
              false,
            );
          } else {
            foundItem = itemInThisList;
            originalFoundList = value!;
          }
        }
      }

      return foundItem;
    }
  };

  public readonly FlattenContainersIn = (container: RuntimeContainer): void => {
    // Need to create a collection to hold the inner containers
    // because otherwise we'd end up modifying during iteration
    const innerContainers = new Set<RuntimeContainer>();
    if (container.content) {
      for (const c of container.content) {
        const innerContainer = asOrNull(c, RuntimeContainer);
        if (innerContainer) {
          innerContainers.add(innerContainer);
        }
      }
    }

    // Can't flatten the named inner containers, but we can at least
    // iterate through their children
    if (container.namedContent) {
      for (const [, value] of container.namedContent) {
        const namedInnerContainer = asOrNull(value, RuntimeContainer);
        if (namedInnerContainer) {
          innerContainers.add(namedInnerContainer);
        }
      }
    }

    for (const innerContainer of innerContainers) {
      // Count-flag reconcile for incremental container reuse. This walk runs
      // after ALL generation and before `ResolveReferences`, and visits every
      // container in the tree exactly once, so it doubles as the reconcile
      // point: a container seen for the FIRST time (fresh this compile) has
      // flags that are purely generation-derived — snapshot them as its
      // intrinsic state. A REUSED container additionally carries last
      // compile's resolve-time cross-flow sets — restore it to intrinsic so
      // this compile's resolve pass re-derives exactly the sets that still
      // exist (a deleted remote read-count decays instead of sticking).
      if (innerContainer._intrinsicVisits === undefined) {
        innerContainer._intrinsicVisits = innerContainer.visitsShouldBeCounted;
        innerContainer._intrinsicTurns = innerContainer.turnIndexShouldBeCounted;
      } else {
        innerContainer.visitsShouldBeCounted = innerContainer._intrinsicVisits;
        innerContainer.turnIndexShouldBeCounted =
          innerContainer._intrinsicTurns!;
      }
      this.TryFlattenContainer(innerContainer);
      this.FlattenContainersIn(innerContainer);
    }
  };

  public readonly TryFlattenContainer = (container: RuntimeContainer): void => {
    if (
      (container.namedContent && container.namedContent.size > 0) ||
      container.hasValidName ||
      container._dontFlatten
    ) {
      return;
    }

    // Inline all the content in container into the parent
    const parentContainer = asOrNull(container.parent, RuntimeContainer);
    if (parentContainer) {
      let contentIdx = parentContainer.content.indexOf(container);
      parentContainer.content.splice(contentIdx, 1);

      const dm = container.ownDebugMetadata;

      if (container.content) {
        for (const innerContent of container.content) {
          innerContent.parent = null;
          if (dm !== null && innerContent.ownDebugMetadata === null) {
            innerContent.debugMetadata = dm;
          }

          parentContainer.InsertContent(innerContent, contentIdx);
          contentIdx += 1;
        }
      }
    }
  };

  public override readonly Error = (
    message: string,
    source: ParsedObject | DebugMetadata | null | undefined,
    isWarning: boolean | null | undefined,
    // Node that raised the diagnostic (see `ParsedObject.Error`). Defaults to
    // `source` for the direct callers that don't bubble through a parent.
    raiser?: ParsedObject,
  ) => {
    let errorType: ErrorType = isWarning ? ErrorType.Warning : ErrorType.Error;

    this._hadError = errorType === ErrorType.Error;
    this._hadWarning = errorType === ErrorType.Warning;

    // Attribute generation-time diagnostics to their top-level flow (see
    // `_generationPhase`). `source` may be raw DebugMetadata (no parent
    // chain) — then the diagnostic can't be attributed and the compiler must
    // assume the worst.
    if (this._generationPhase) {
      // Prefer the raiser: `source` is frequently an `Identifier` or raw
      // `DebugMetadata` (chosen for dedup/reporting), and neither carries a
      // parent chain to attribute from.
      let node: ParsedObject | null =
        raiser ??
        (source instanceof DebugMetadata ? null : (source ?? null));
      if (!(node instanceof ParsedObject)) {
        node = null;
      }
      while (node && node.parent && !(node.parent instanceof Story)) {
        node = node.parent;
      }
      if (node && node.parent instanceof Story) {
        this.flowsWithGenerationDiagnostics.add(node);
      } else {
        this.hadUnattributableGenerationDiagnostic = true;
      }
    }

    if (this._errorHandler !== null) {
      const debugMetadata =
        source instanceof DebugMetadata ? source : source?.debugMetadata;
      const metadata = debugMetadata
        ? {
            fileName: debugMetadata.fileName,
            filePath: debugMetadata.filePath,
            startLineNumber: debugMetadata.startLineNumber,
            endLineNumber: debugMetadata.endLineNumber,
            startCharacterNumber: debugMetadata.startCharacterNumber,
            endCharacterNumber: debugMetadata.endCharacterNumber,
          }
        : null;
      this._errorHandler(message, errorType, metadata);
    } else {
      let sb = "";
      if (source instanceof AuthorWarning) {
        sb += "TODO: ";
        errorType = ErrorType.Information;
      } else if (isWarning) {
        sb += "WARNING: ";
      } else {
        sb += "ERROR: ";
      }

      const debugMetadata =
        source instanceof DebugMetadata ? source : source?.debugMetadata;

      if (debugMetadata != null && debugMetadata.startLineNumber >= 1) {
        if (debugMetadata.fileName != null) {
          sb += `'${debugMetadata.fileName}' `;
        }

        sb += `line ${debugMetadata.startLineNumber}: `;
      }

      sb += message;

      message = sb;
      throw new Error(message);
    }
  };

  public readonly ResetError = (): void => {
    this._hadError = false;
    this._hadWarning = false;
  };

  public readonly IsExternal = (namedFuncTarget: string): boolean =>
    this.externals.has(namedFuncTarget);

  public readonly AddExternal = (decl: ExternalDeclaration): void => {
    if (this.externals.has(decl.name!)) {
      this.Error(
        `Duplicate external definition of \`${decl.name}\``,
        decl,
        false,
      );
    } else if (decl.name) {
      this.externals.set(decl.name, decl);
    }
  };

  public readonly DontFlattenContainer = (
    container: RuntimeContainer,
  ): void => {
    // Marked on the container itself (not a per-compile Set on this Story) so
    // the protection survives container reuse across compiles — a reused
    // flow's generation is skipped, so it gets no chance to re-register here.
    container._dontFlatten = true;
  };

  public readonly NameConflictError = (
    obj: ParsedObject,
    identifier: Identifier,
    newObj: ParsedObject | Identifier | DebugMetadata,
  ): void => {
    obj.Error(
      `Duplicate identifier \`${
        identifier.name
      }\`. A ${obj.typeName.toLowerCase()} named \`${
        identifier.name
      }\` already exists on ${identifier.debugMetadata}`,
      newObj,
    );
  };

  // Check given symbol type against everything that's of a higher priority in the ordered SymbolType enum (above).
  // When the given symbol type level is reached, we early-out / return.
  public readonly CheckForNamingCollisions = (
    obj: ParsedObject,
    identifier: Identifier,
    symbolType: SymbolType,
    typeNameOverride: string = "",
  ): void => {
    const typeNameToPrint: string = typeNameOverride || obj.typeName;
    if (identifier?.name) {
      for (const part of identifier.name.split(".")) {
        if (Story.IsReservedKeyword(part)) {
          obj.Error(
            `\`${part}\` cannot be used for the name of a ${typeNameToPrint.toLowerCase()} because it's a reserved keyword`,
            identifier?.debugMetadata,
          );
          return;
        } else if (FunctionCall.IsBuiltIn(part)) {
          // Lua-fidelity stdlib shadowing: locals (SymbolType.Temp)
          // may bind a built-in name; references inside the local's
          // scope read the binding. Globals (Var) still error to
          // preserve top-level safety — `var print = 1` would silently
          // break every `print(...)` call in the story. Function
          // parameters (Arg) also permit shadowing since they're
          // scoped to the function body.
          if (symbolType === SymbolType.Temp || symbolType === SymbolType.Arg) {
            continue;
          }
          obj.Error(
            `\`${part}\` cannot be used for the name of a ${typeNameToPrint.toLowerCase()} because it's a built in function`,
            identifier?.debugMetadata,
          );

          return;
        }
      }
    }

    // Top level knots
    const maybeKnotOrFunction = this.ContentWithNameAtLevel(
      identifier?.name || "",
      FlowLevel.Knot,
    );

    const knotOrFunction = asOrNull(maybeKnotOrFunction, FlowBase);

    // Luau-superset semantics: function parameters (Arg) and local
    // variables (Temp) may shadow top-level knot/function names. This
    // matters for closure upvalues — `scanFreeVariables` captures any
    // referenced top-level callable as an upval, which is then
    // prepended to the synthetic closure's parameter list. Original
    // ink errored on parameter/local names colliding with knots; that
    // breaks `local function f() ... concat(...) end` whenever `concat`
    // is itself a top-level function (basic.luau line 4).
    if (
      knotOrFunction &&
      knotOrFunction !== obj &&
      symbolType !== SymbolType.Arg &&
      symbolType !== SymbolType.Temp
    ) {
      if (obj instanceof Stitch && knotOrFunction.identifier) {
        this.NameConflictError(
          knotOrFunction,
          knotOrFunction.identifier,
          obj.identifier || obj,
        );
      } else {
        this.NameConflictError(
          obj,
          identifier,
          knotOrFunction?.identifier || knotOrFunction,
        );
      }
      return;
    }

    if (symbolType < SymbolType.List) {
      return;
    }

    // Lists
    for (const [key, value] of this._listDefs) {
      if (
        identifier?.name === key &&
        obj !== value &&
        value.variableAssignment !== obj
      ) {
        this.NameConflictError(obj, identifier, value.identifier || value);
      }

      // We don't check for conflicts between individual elements in
      // different lists because they are namespaced.
      if (!(obj instanceof ListElementDefinition)) {
        for (const item of value.itemDefinitions) {
          if (identifier?.name === item.name) {
            this.NameConflictError(obj, identifier, item.indentifier || item);
          }
        }
      }
    }

    if (symbolType < SymbolType.List) {
      return;
    }

    // Structs
    for (const [key, value] of this._structDefs) {
      if (
        (identifier?.name === key ||
          identifier?.name + "." + "$default" === key) &&
        obj !== value &&
        value.variableAssignment !== obj
      ) {
        // Same-name structs of DIFFERENT types are namespaced
        // (context[type][name] — e.g. `define raffles as character` +
        // `define raffles as synth`), so they don't conflict. Two of the
        // SAME type still do.
        // A ROOT define (`define image with …`) declares a type and carries
        // no `structDefinition`/`type`, so fall back to its own name as its
        // type identity — letting the builtin type `image` coexist with a
        // same-named instance of another type (`style.image`).
        const defType = (o: any): string | undefined =>
          o?.type?.name ??
          o?.structDefinition?.type?.name ??
          (o?.isDefineDeclaration ? o?.variableName : undefined);
        const objType = defType(obj);
        const valType = value.type?.name ?? defType(value.variableAssignment);
        if (objType && valType && objType !== valType) {
          continue;
        }
        // A project OVERRIDING a builtin of the SAME type. The incumbent came
        // from the source-injected builtins prelude, which exists to be
        // overridden — so this is the intended `define slate_80 as color` /
        // `define ui as config` re-theme, not a collision. The struct registry
        // is a SECOND collision check, independent of the declaration one in
        // FlowBase.AddNewVariableDeclaration; both have to agree or an override
        // still fails the compile. See SparkdownCompiler.applyBuiltinOverrides.
        const fromPrelude = (o: any): boolean =>
          Boolean(
            o?.isPreludeDeclaration ??
              o?.variableAssignment?.isPreludeDeclaration,
          );
        // Symmetric: `_structDefs` may hold either side as the incumbent
        // depending on registration order, so compare provenance rather than
        // assuming the builtin is the one already registered.
        if (fromPrelude(value) !== fromPrelude(obj)) {
          continue;
        }
        this.NameConflictError(obj, identifier, value.identifier || value);
      }
    }

    // Global variable collision
    const constDecl =
      (identifier?.name && this.constants.get(identifier.name)) || null;
    if (constDecl && constDecl !== obj) {
      this.NameConflictError(constDecl, constDecl.identifier!, identifier);
    }

    // Don't check for var->var conflicts because that's handled separately
    // (necessary since checking looks up in a dictionary)
    if (symbolType <= SymbolType.Var) {
      return;
    }

    // Global variable collision
    const varDecl: VariableAssignment | null =
      (identifier?.name && this.variableDeclarations.get(identifier?.name)) ||
      null;
    if (
      varDecl &&
      varDecl !== obj &&
      varDecl.isGlobalDeclaration &&
      varDecl.listDefinition == null &&
      varDecl.structDefinition == null &&
      // A ROOT define (`define image with …`) declares a type and has no
      // structDefinition, but it is NOT a plain var — a same-named instance of
      // a DIFFERENT type (e.g. `style.image`) coexists with it (namespaced as a
      // type-scoped singleton; see FlowBase.AddNewVariableDeclaration). Only a
      // genuine plain-var collision should error here.
      !varDecl.isDefineDeclaration
    ) {
      this.NameConflictError(obj, identifier, varDecl.identifier!);
    }

    if (symbolType < SymbolType.SubFlowAndWeave) {
      return;
    }

    // Stitches, Choices and Gathers
    // Skip path-resolution shadowing for Arg/Temp: Luau-superset
    // semantics allow function parameters and local variables to
    // shadow any callable, including stitches and gather labels.
    // Closure upvalues are added as synthetic parameters, so without
    // this exception any upval named after a top-level knot or stitch
    // (e.g. a body that references `concat` when there's a
    // `function concat(...)` at file scope) would error here.
    if (symbolType !== SymbolType.Arg && symbolType !== SymbolType.Temp) {
      const path = new Path(identifier);
      const targetContent = path.ResolveFromContext(obj);
      if (targetContent && targetContent !== obj) {
        this.NameConflictError(
          obj,
          identifier,
          targetContent?.identifier || targetContent,
        );
        return;
      }
    }

    if (symbolType < SymbolType.Arg) {
      return;
    }

    // Arguments to the current flow
    //
    // Luau-superset semantics: function parameters and local
    // variables (`SymbolType.Temp`) may freely shadow each other.
    // `function f(b) local b = 1 end` is valid Luau — the inner
    // `local b` shadows the parameter `b` within its block scope.
    // Same for synthesized upval-as-params on closures (which is
    // how nested `function NAME(b)` declarations lower): an inner
    // `local b` SHOULD shadow the captured-upval parameter, not
    // error. So skip the duplicate-param check entirely for Temp.
    if (symbolType !== SymbolType.Arg && symbolType !== SymbolType.Temp) {
      let flow: FlowBase | null = asOrNull(obj, FlowBase);
      if (!flow) {
        flow = ClosestFlowBase(obj);
      }

      if (flow && flow.hasParameters && flow.args) {
        for (const arg of flow.args) {
          if (arg.identifier?.name === identifier?.name) {
            obj.Error(
              `Duplicate identifier \`${identifier}\`. A parameter named \`${identifier}\` already exists for ${flow.identifier} on ${flow.debugMetadata}`,
              varDecl?.identifier!.debugMetadata,
            );

            return;
          }
        }
      }
    }
  };
}
