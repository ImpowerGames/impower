import {
  Container,
  ControlCommand,
  ErrorType,
  ListDefinition,
  Story,
  StringBuilder,
  VariableAssignment,
} from "../../../impower-script-engine";
import { ErrorHandler } from "../../types/ErrorHandler";
import { FlowLevel } from "../../types/FlowLevel";
import { Identifier } from "../../types/Identifier";
import { IExpression } from "../../types/IExpression";
import { IExternalDeclaration } from "../../types/IExternalDeclaration";
import { isFlowBase } from "../../types/IFlowBase";
import { IListDefinition } from "../../types/IListDefinition";
import { IObject } from "../../types/IObject";
import { IStory } from "../../types/IStory";
import { SymbolType } from "../../types/SymbolType";
import { ParsedAuthorWarning } from "./ParsedAuthorWarning";
import { ParsedConstantDeclaration } from "./ParsedConstantDeclaration";
import { ParsedFlowBase } from "./ParsedFlowBase";
import { ParsedFunctionCall } from "./ParsedFunctionCall";
import { ParsedIncludedFile } from "./ParsedIncludedFile";
import { ParsedListDefinition } from "./ParsedListDefinition";
import { ParsedListElementDefinition } from "./ParsedListElementDefinition";
import { ParsedObject } from "./ParsedObject";
import { ParsedPath } from "./ParsedPath";
import { ParsedText } from "./ParsedText";

export class ParsedStory extends ParsedFlowBase implements IStory {
  constants: Record<string, IExpression> = null;

  externals: Record<string, IExternalDeclaration> = null;

  // Build setting for exporting:
  // When true, the visit count for *all* knots, stitches, choices,
  // and gathers is counted. When false, only those that are direclty
  // referenced by the ink are recorded. Use this flag to allow game-side
  // querying of  arbitrary knots/stitches etc.
  // Storing all counts is more robust and future proof (updates to the story file
  // that reference previously uncounted visits are possible, but generates a much
  // larger safe file, with a lot of potentially redundant counts.
  countAllVisits = false;

  private _errorHandler: ErrorHandler = null;

  private _hadError = false;

  private _hadWarning = false;

  private _dontFlattenContainers: Set<Container> = null;

  private _listDefs: Record<string, IListDefinition> = null;

  get flowLevel(): FlowLevel {
    return FlowLevel.Story;
  }

  /// <summary>
  /// Had error during code gen, resolve references?
  /// Most of the time it shouldn't be necessary to use this
  /// since errors should be caught by the error handler.
  /// </summary>
  get hadError(): boolean {
    return this._hadError;
  }

  get hadWarning(): boolean {
    return this._hadWarning;
  }

  constructor(toplevelObjects: ParsedObject[], isInclude = false) {
    // Don't do anything much on construction, leave it lightweight until
    // the ExportRuntime method is called.
    super(null, toplevelObjects, null, false, isInclude);
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
  protected override PreProcessTopLevelObjects(
    topLevelContent: ParsedObject[]
  ): void {
    const flowsFromOtherFiles: ParsedFlowBase[] = [];

    // Inject included files
    let i = 0;
    while (i < topLevelContent.length) {
      const obj = topLevelContent[i];
      if (!(obj instanceof ParsedIncludedFile)) {
        // Non-include: skip over it
        i += 1;
      } else {
        const file = obj;

        // Remove the IncludedFile itself
        topLevelContent.splice(i, 1);

        // When an included story fails to load, the include
        // line itself is still valid, so we have to handle it here
        if (file.includedStory) {
          const nonFlowContent: ParsedObject[] = [];

          const subStory = file.includedStory;

          // Allow empty file
          if (subStory.content != null) {
            subStory.content.forEach((subStoryObj) => {
              if (subStoryObj instanceof ParsedFlowBase) {
                flowsFromOtherFiles.push(subStoryObj);
              } else {
                nonFlowContent.push(subStoryObj as ParsedObject);
              }
            });

            // Add newline on the end of the include
            nonFlowContent.push(new ParsedText("\n"));

            // Add contents of the file in its place
            topLevelContent.splice(i, 0, ...nonFlowContent);

            // Skip past the content of this sub story
            // (since it will already have recursively included
            //  any lines from other files)
            i += nonFlowContent.length;
          }
        }
      }
    }

    // Add the flows we collected from the included files to the
    // end of our list of our content
    topLevelContent.push(...flowsFromOtherFiles);
  }

  ExportRuntime(errorHandler: ErrorHandler = null): Story {
    this._errorHandler = errorHandler;

    // Find all constants before main export begins, so that VariableReferences know
    // whether to generate a runtime variable reference or the literal value
    this.constants = {};
    this.FindAll<ParsedConstantDeclaration>().forEach((constDecl) => {
      // Check for duplicate definitions
      const existingDefinition = this.constants[constDecl.constantName];
      if (existingDefinition !== undefined) {
        if (!existingDefinition.Equals(constDecl.expression)) {
          const errorMsg = `CONST '${constDecl.constantName}' has been redefined with a different value. Multiple definitions of the same CONST are valid so long as they contain the same value. Initial definition was on ${existingDefinition.debugMetadata}.`;
          this.Error(errorMsg, constDecl, false);
        }
      }

      this.constants[constDecl.constantName] = constDecl.expression;
    });

    // List definitions are treated like constants too - they should be usable
    // from other variable declarations.
    this._listDefs = {};
    this.FindAll<ParsedListDefinition>().forEach((listDef) => {
      this._listDefs[listDef.identifier?.name] = listDef;
    });

    this.externals = {};

    // Resolution of weave point names has to come first, before any runtime code generation
    // since names have to be ready before diverts start getting created.
    // (It used to be done in the constructor for a weave, but didn't allow us to generate
    // errors when name resolution failed.)
    this.ResolveWeavePointNaming();

    // Get default implementation of runtimeObject, which calls ContainerBase's generation method
    const rootContainer = this.runtimeObject as Container;

    // Export initialisation of global variables
    // TODO: We *could* add this as a declarative block to the story itself...
    const variableInitialisation = new Container();
    variableInitialisation.AddContent(ControlCommand.EvalStart());

    // Global variables are those that are local to the story and marked as global
    const runtimeLists: ListDefinition[] = [];
    const variableDeclarationsEntries = Object.entries(
      this.variableDeclarations
    );
    variableDeclarationsEntries.forEach(([varName, varDecl]) => {
      if (varDecl.isGlobalDeclaration) {
        if (varDecl.listDefinition != null) {
          this._listDefs[varName] = varDecl.listDefinition;
          variableInitialisation.AddContent(
            varDecl.listDefinition.runtimeObject
          );
          runtimeLists.push(varDecl.listDefinition.runtimeListDefinition);
        } else {
          varDecl.expression.GenerateIntoContainer(variableInitialisation);
        }

        const runtimeVarAss = new VariableAssignment(varName, true);
        runtimeVarAss.isGlobal = true;
        variableInitialisation.AddContent(runtimeVarAss);
      }
    });

    variableInitialisation.AddContent(ControlCommand.EvalEnd());
    variableInitialisation.AddContent(ControlCommand.End());

    if (variableDeclarationsEntries.length > 0) {
      variableInitialisation.name = "global decl";
      rootContainer.AddToNamedContentOnly(variableInitialisation);
    }

    // Signal that it's safe to exit without error, even if there are no choices generated
    // (this only happens at the end of top level content that isn't in any particular knot)
    rootContainer.AddContent(ControlCommand.Done());

    // Replace runtimeObject with Story object instead of the Runtime.Container generated by Parsed.ContainerBase
    const runtimeStory = new Story(rootContainer, runtimeLists);

    this.runtimeObject = runtimeStory;

    if (this._hadError) {
      return null;
    }

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
    this.ResolveReferences(this);

    if (this._hadError) {
      return null;
    }

    runtimeStory.ResetState();

    return runtimeStory;
  }

  public ResolveList(listName: string): ParsedListDefinition {
    const list = this._listDefs[listName];
    if (list === undefined) {
      return null;
    }
    return list as ParsedListDefinition;
  }

  public ResolveListItem(
    listName: string,
    itemName: string,
    source?: ParsedObject
  ): ParsedListElementDefinition {
    // Search a specific list if we know its name (i.e. the form listName.itemName)
    if (listName != null) {
      const listDef = this._listDefs[listName];
      if (listDef === undefined) {
        return null;
      }

      return listDef.ItemNamed(itemName) as ParsedListElementDefinition;
    }

    // Otherwise, try to search all lists

    let foundItem: ParsedListElementDefinition = null;
    let originalFoundList: IListDefinition = null;

    Object.values(this._listDefs).forEach((listToSearch) => {
      const itemInThisList = listToSearch.ItemNamed(itemName);
      if (itemInThisList) {
        if (foundItem != null) {
          this.Error(
            `Ambiguous item name '${itemName}' found in multiple sets, including ${originalFoundList.identifier} and ${listToSearch.identifier}`,
            source,
            false
          );
        } else {
          foundItem = itemInThisList as ParsedListElementDefinition;
          originalFoundList = listToSearch;
        }
      }
    });

    return foundItem;
  }

  FlattenContainersIn(container: Container): void {
    // Need to create a collection to hold the inner containers
    // because otherwise we'd end up modifying during iteration
    const innerContainers = new Set<Container>();

    container.content.forEach((c) => {
      const innerContainer = c as Container;
      if (innerContainer) {
        innerContainers.add(innerContainer);
      }
    });

    // Can't flatten the named inner containers, but we can at least
    // iterate through their children
    if (container.namedContent != null) {
      Object.values(container.namedContent).forEach((namedInnerContainer) => {
        if (namedInnerContainer) {
          innerContainers.add(namedInnerContainer as Container);
        }
      });
    }

    innerContainers.forEach((innerContainer) => {
      this.TryFlattenContainer(innerContainer);
      this.FlattenContainersIn(innerContainer);
    });
  }

  TryFlattenContainer(container: Container): void {
    if (
      Object.keys(container.namedContent).length > 0 ||
      container.hasValidName ||
      this._dontFlattenContainers.has(container)
    )
      return;

    // Inline all the content in container into the parent
    const parentContainer = container.parent as Container;
    if (parentContainer) {
      let contentIdx = parentContainer.content.indexOf(container);
      parentContainer.content.splice(contentIdx, 1);

      const dm = container.ownDebugMetadata;

      container.content.forEach((innerContent) => {
        innerContent.parent = null;
        if (dm != null && innerContent.ownDebugMetadata == null) {
          innerContent.debugMetadata = dm;
        }
        parentContainer.InsertContent(innerContent, contentIdx);
        contentIdx += 1;
      });
    }
  }

  override Error(message: string, source: IObject, isWarning: boolean): void {
    let errorType: ErrorType = isWarning ? ErrorType.Warning : ErrorType.Error;

    const sb = new StringBuilder();
    if (source instanceof ParsedAuthorWarning) {
      sb.Append("TODO: ");
      errorType = ErrorType.Author;
    } else if (isWarning) {
      sb.Append("WARNING: ");
    } else {
      sb.Append("ERROR: ");
    }

    if (
      source &&
      source.debugMetadata != null &&
      source.debugMetadata.startLineNumber >= 1
    ) {
      if (source.debugMetadata.fileName != null) {
        sb.AppendFormat("'{0}' ", source.debugMetadata.fileName);
      }

      sb.AppendFormat("line {0}: ", source.debugMetadata.startLineNumber);
    }

    sb.Append(message);

    message = sb.ToString();

    if (this._errorHandler != null) {
      this._hadError = errorType === ErrorType.Error;
      this._hadWarning = errorType === ErrorType.Warning;
      this._errorHandler(message, errorType);
    } else {
      throw new Error(message);
    }
  }

  ResetError(): void {
    this._hadError = false;
    this._hadWarning = false;
  }

  IsExternal(namedFuncTarget: string): boolean {
    return this.externals[namedFuncTarget] !== undefined;
  }

  AddExternal(decl: IExternalDeclaration): void {
    if (this.externals[decl.name] !== undefined) {
      this.Error(
        `Duplicate EXTERNAL definition of '${decl.name}'`,
        decl,
        false
      );
    } else {
      this.externals[decl.name] = decl;
    }
  }

  DontFlattenContainer(container: Container): void {
    this._dontFlattenContainers.add(container);
  }

  NameConflictError(
    obj: IObject,
    name: string,
    existingObj: IObject,
    typeNameToPrint: string
  ): void {
    obj.Error(
      `${typeNameToPrint} '${name}': name has already been used for a ${existingObj.typeName.toLowerCase()} on ${
        existingObj.debugMetadata
      }`
    );
  }

  static IsReservedKeyword(name: string): boolean {
    switch (name) {
      case "true":
      case "false":
      case "not":
      case "return":
      case "else":
      case "VAR":
      case "CONST":
      case "temp":
      case "LIST":
      case "function":
        return true;
      default:
        return false;
    }
  }

  // Check given symbol type against everything that's of a higher priority in the ordered SymbolType enum (above).
  // When the given symbol type level is reached, we early-out / return.
  CheckForNamingCollisions(
    obj: IObject,
    identifier: Identifier,
    symbolType: SymbolType,
    typeNameOverride?: string
  ): void {
    const typeNameToPrint = typeNameOverride || obj.typeName;
    if (ParsedStory.IsReservedKeyword(identifier?.name)) {
      obj.Error(
        `'${
          this.name
        }' cannot be used for the name of a ${typeNameToPrint.toLowerCase()} because it's a reserved keyword`
      );
      return;
    }

    if (ParsedFunctionCall.IsBuiltIn(identifier?.name)) {
      obj.Error(
        `'${
          this.name
        }' cannot be used for the name of a ${typeNameToPrint.toLowerCase()} because it's a built in function`
      );
      return;
    }

    // Top level knots
    const knotOrFunction = this.ContentWithNameAtLevel(
      identifier?.name,
      FlowLevel.Knot
    );
    if (
      knotOrFunction &&
      (knotOrFunction !== obj || symbolType === SymbolType.Arg)
    ) {
      this.NameConflictError(
        obj,
        identifier?.name,
        knotOrFunction,
        typeNameToPrint
      );
      return;
    }

    if (symbolType < SymbolType.List) {
      return;
    }

    // Lists
    Object.entries(this._listDefs).forEach(([listDefName, listDef]) => {
      if (
        identifier?.name === listDefName &&
        obj !== listDef &&
        listDef.variableAssignment !== obj
      ) {
        this.NameConflictError(obj, identifier?.name, listDef, typeNameToPrint);
      }

      // We don't check for conflicts between individual elements in
      // different lists because they are namespaced.
      if (!(obj instanceof ParsedListElementDefinition)) {
        listDef.itemDefinitions.forEach((item) => {
          if (identifier?.name === item.name) {
            this.NameConflictError(
              obj,
              identifier?.name,
              item,
              typeNameToPrint
            );
          }
        });
      }
    });

    // Don't check for VAR->VAR conflicts because that's handled separately
    // (necessary since checking looks up in a dictionary)
    if (symbolType <= SymbolType.Var) {
      return;
    }

    // Global variable collision
    const varDecl = this.variableDeclarations[identifier?.name];
    if (varDecl !== undefined) {
      if (
        varDecl !== obj &&
        varDecl.isGlobalDeclaration &&
        varDecl.listDefinition == null
      ) {
        this.NameConflictError(obj, identifier?.name, varDecl, typeNameToPrint);
      }
    }

    if (symbolType < SymbolType.SubFlowAndWeave) {
      return;
    }

    // Stitches, Choices and Gathers
    const path = new ParsedPath([identifier]);
    const targetContent = path.ResolveFromContext(obj);
    if (targetContent && targetContent !== obj) {
      this.NameConflictError(
        obj,
        identifier?.name,
        targetContent,
        typeNameToPrint
      );
      return;
    }

    if (symbolType < SymbolType.Arg) {
      return;
    }

    // Arguments to the current flow
    if (symbolType !== SymbolType.Arg) {
      let flow: IObject;
      if (!isFlowBase(obj)) {
        flow = obj.ClosestFlowBase();
      }
      if (isFlowBase(flow) && flow.hasParameters) {
        for (let i = 0; i < flow.arguments.length; i += 1) {
          const arg = flow.arguments[i];
          if (arg.identifier?.name === identifier?.name) {
            obj.Error(
              `${typeNameToPrint} '${this.name}': Name has already been used for a argument to ${flow.identifier} on ${flow.debugMetadata}`
            );
            return;
          }
        }
      }
    }
  }
}
