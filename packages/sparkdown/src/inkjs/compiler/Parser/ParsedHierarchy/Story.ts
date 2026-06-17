import { AuthorWarning } from "./AuthorWarning";
import { ConstantDeclaration } from "./Declaration/ConstantDeclaration";
import { Container as RuntimeContainer } from "../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../engine/ControlCommand";
import { ErrorHandler } from "../../../engine/Error";
import { ErrorType } from "../ErrorType";
import { Expression } from "./Expression/Expression";
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
  private _dontFlattenContainers: Set<RuntimeContainer> = new Set();
  private _listDefs: Map<string, ListDefinition> = new Map();
  private _structDefs: Map<string, StructDefinition> = new Map();

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

    // Find all constants before main export begins, so that VariableReferences know
    // whether to generate a runtime variable reference or the literal value
    this.constants = new Map();
    for (const constDecl of this.FindAll(ConstantDeclaration)()) {
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

    // List definitions are treated like constants too - they should be usable
    // from other variable declarations.
    this._listDefs = new Map();
    for (const listDef of this.FindAll<ListDefinition>(ListDefinition)()) {
      if (listDef.identifier?.name) {
        this._listDefs.set(listDef.identifier?.name, listDef);
      }
    }

    // Struct definitions are treated like constants too - they should be usable
    // from other variable declarations.
    this._structDefs = new Map();
    const runtimeStructs: RuntimeStructDefinition[] = [];
    for (const structDef of this.FindAll(StructDefinition)()) {
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
    for (const structDef of this.FindAll(StructDefinition)()) {
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
      // child's `__def` at runtime) — nothing to initialize here.
      if (implicitParentNames.has(key)) {
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

    this.runtimeObject = runtimeStory;

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
      this.TryFlattenContainer(innerContainer);
      this.FlattenContainersIn(innerContainer);
    }
  };

  public readonly TryFlattenContainer = (container: RuntimeContainer): void => {
    if (
      (container.namedContent && container.namedContent.size > 0) ||
      container.hasValidName ||
      this._dontFlattenContainers.has(container)
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
  ) => {
    let errorType: ErrorType = isWarning ? ErrorType.Warning : ErrorType.Error;

    this._hadError = errorType === ErrorType.Error;
    this._hadWarning = errorType === ErrorType.Warning;

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
    this._dontFlattenContainers.add(container);
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
        this.NameConflictError(obj, identifier, value.identifier || value);
      }
    }

    // Global variable collision
    const constDecl =
      (identifier?.name && this.constants.get(identifier.name)) || null;
    if (constDecl && constDecl !== obj) {
      this.NameConflictError(constDecl, constDecl.identifier, identifier);
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
      this.NameConflictError(obj, identifier, varDecl.identifier);
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
              varDecl?.identifier.debugMetadata,
            );

            return;
          }
        }
      }
    }
  };
}
