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
      case "LIST":
      case "list":
      case "DEFINE":
      case "define":
      case "function":
      case "system":
      case "scene":
      case "branch":
      case "none":
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
    topLevelContent: ParsedObject[]
  ): void {
    super.PreProcessTopLevelObjects(topLevelContent);

    const flowsFromOtherFiles: ParsedObject[] = [];

    // Inject included files
    for (let obj of topLevelContent) {
      if (obj instanceof IncludedFile) {
        const file: IncludedFile = obj;

        // Remove the IncludedFile itself
        const posOfObj = topLevelContent.indexOf(obj);
        topLevelContent.splice(posOfObj, 1);

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
            topLevelContent.splice(posOfObj, 0, ...nonFlowContent);

            // Skip past the content of this sub story
            // (since it will already have recursively included
            //  any lines from other files)
          }
        }

        // Include object has been removed, with possible content inserted,
        // and position of 'i' will have been determined already.
        continue;
      }
    }

    // Add the flows we collected from the included files to the
    // end of our list of our content
    topLevelContent.splice(0, 0, ...flowsFromOtherFiles);
  }

  public readonly ExportRuntime = (
    errorHandler: ErrorHandler | null = null
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
          const errorMsg = `Cannot redeclare const '${constDecl.constantName}' with a different value. (It is already declared on ${existingDefinition.debugMetadata})`;
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
      if (structDef.scopedIdentifier?.name) {
        this._structDefs.set(structDef.scopedIdentifier?.name, structDef);
        runtimeStructs.push(structDef.runtimeStructDefinition);
        if (!structDef.modifier?.name && structDef.name?.name !== "$default") {
          // Each struct property should be saved as its own dot-accessible variable
          for (const prop of structDef.propertyDefinitions) {
            if (
              prop.expression &&
              !(prop.expression instanceof ObjectExpression) &&
              !(prop.expression instanceof VariableReference)
            ) {
              const variableIdentifier = new Identifier(
                structDef.key + prop.key
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

    // Export initialisation of global variables
    // TODO: We *could* add this as a declarative block to the story itself...
    const variableInitialization = new RuntimeContainer();
    variableInitialization.AddContent(RuntimeControlCommand.EvalStart());

    // Global variables are those that are local to the story and marked as global
    const runtimeLists: RuntimeListDefinition[] = [];
    for (const [key, value] of this.variableDeclarations) {
      if (value.isGlobalDeclaration) {
        if (value.listDefinition) {
          this._listDefs.set(key, value.listDefinition);
          runtimeLists.push(value.listDefinition.runtimeListDefinition);
          variableInitialization.AddContent(
            value.listDefinition.runtimeObject!
          );
        } else if (value.structDefinition) {
          this._structDefs.set(key, value.structDefinition);
          runtimeStructs.push(value.structDefinition.runtimeStructDefinition);
        } else {
          if (!value.expression) {
            throw new Error();
          }
          value.expression.GenerateIntoContainer(variableInitialization);
        }

        // Don't initialize structs at runtime
        // They should only be initialized at compiletime and never serialized in save state
        if (!value.structDefinition) {
          const runtimeVarAss = new RuntimeVariableAssignment(key, true);
          runtimeVarAss.isGlobal = true;
          variableInitialization.AddContent(runtimeVarAss);
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
      runtimeStructs
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
    } catch {}

    runtimeStory.ResetState();

    return runtimeStory;
  };

  public readonly ResolveStruct = (
    structName: string
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
    source: ParsedObject | null = null
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
              `Ambiguous item name '${itemName}' found in multiple sets, including ${
                originalFoundList!.identifier
              } and ${value!.identifier}`,
              source,
              false
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
    isWarning: boolean | null | undefined
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
        `Duplicate external definition of '${decl.name}'`,
        decl,
        false
      );
    } else if (decl.name) {
      this.externals.set(decl.name, decl);
    }
  };

  public readonly DontFlattenContainer = (
    container: RuntimeContainer
  ): void => {
    this._dontFlattenContainers.add(container);
  };

  public readonly NameConflictError = (
    obj: ParsedObject,
    identifier: Identifier,
    newObj: ParsedObject | Identifier | DebugMetadata
  ): void => {
    obj.Error(
      `Duplicate identifier '${
        identifier.name
      }'. A ${obj.typeName.toLowerCase()} named '${
        identifier.name
      }' already exists on ${identifier.debugMetadata}`,
      newObj
    );
  };

  // Check given symbol type against everything that's of a higher priority in the ordered SymbolType enum (above).
  // When the given symbol type level is reached, we early-out / return.
  public readonly CheckForNamingCollisions = (
    obj: ParsedObject,
    identifier: Identifier,
    symbolType: SymbolType,
    typeNameOverride: string = ""
  ): void => {
    const typeNameToPrint: string = typeNameOverride || obj.typeName;
    for (const part of identifier?.name.split(".")) {
      if (Story.IsReservedKeyword(part)) {
        obj.Error(
          `'${part}' cannot be used for the name of a ${typeNameToPrint.toLowerCase()} because it's a reserved keyword`,
          identifier?.debugMetadata
        );
        return;
      } else if (FunctionCall.IsBuiltIn(part)) {
        obj.Error(
          `'${part}' cannot be used for the name of a ${typeNameToPrint.toLowerCase()} because it's a built in function`,
          identifier?.debugMetadata
        );

        return;
      }
    }

    // Top level knots
    const maybeKnotOrFunction = this.ContentWithNameAtLevel(
      identifier?.name || "",
      FlowLevel.Knot
    );

    const knotOrFunction = asOrNull(maybeKnotOrFunction, FlowBase);

    if (
      knotOrFunction &&
      (knotOrFunction !== obj || symbolType === SymbolType.Arg)
    ) {
      if (obj instanceof Stitch && knotOrFunction.identifier) {
        this.NameConflictError(
          knotOrFunction,
          knotOrFunction.identifier,
          obj.identifier || obj
        );
      } else {
        this.NameConflictError(
          obj,
          identifier,
          knotOrFunction?.identifier || knotOrFunction
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
        this.NameConflictError(
          obj,
          identifier,
          value.scopedIdentifier || value
        );
      }
    }

    // Global variable collision
    const constDecl =
      (identifier?.name && this.constants.get(identifier.name)) || null;
    if (constDecl && constDecl !== obj) {
      this.NameConflictError(
        constDecl,
        constDecl.constantIdentifier,
        identifier
      );
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
      varDecl.structDefinition == null
    ) {
      this.NameConflictError(obj, identifier, varDecl.variableIdentifier);
    }

    if (symbolType < SymbolType.SubFlowAndWeave) {
      return;
    }

    // Stitches, Choices and Gathers
    const path = new Path(identifier);
    const targetContent = path.ResolveFromContext(obj);
    if (targetContent && targetContent !== obj) {
      this.NameConflictError(obj, identifier, targetContent);
      return;
    }

    if (symbolType < SymbolType.Arg) {
      return;
    }

    // Arguments to the current flow
    if (symbolType !== SymbolType.Arg) {
      let flow: FlowBase | null = asOrNull(obj, FlowBase);
      if (!flow) {
        flow = ClosestFlowBase(obj);
      }

      if (flow && flow.hasParameters && flow.args) {
        for (const arg of flow.args) {
          if (arg.identifier?.name === identifier?.name) {
            obj.Error(
              `Duplicate identifier '${identifier}'. A parameter named '${identifier}' already exists for ${flow.identifier} on ${flow.debugMetadata}`,
              varDecl?.variableIdentifier.debugMetadata
            );

            return;
          }
        }
      }
    }
  };
}
