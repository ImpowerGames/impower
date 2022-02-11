import {
  Container,
  Divert,
  RuntimeObject,
  VariableAssignment,
} from "../../../impower-script-engine";
import { Argument } from "../../types/Argument";
import { FlowLevel } from "../../types/FlowLevel";
import { DONE_IDENTIFIER, Identifier } from "../../types/Identifier";
import { IFlowBase } from "../../types/IFlowBase";
import { INamedContent, isNamedContent } from "../../types/INamedContent";
import { isStory, IStory } from "../../types/IStory";
import { IVariableAssignment } from "../../types/IVariableAssignment";
import { IWeave } from "../../types/IWeave";
import { IWeavePoint } from "../../types/IWeavePoint";
import { SymbolType } from "../../types/SymbolType";
import { VariableResolveResult } from "../../types/VariableResolveResult";
import { ParsedChoice } from "./ParsedChoice";
import { ParsedDivert } from "./ParsedDivert";
import { ParsedDivertTarget } from "./ParsedDivertTarget";
import { ParsedGather } from "./ParsedGather";
import { ParsedKnot } from "./ParsedKnot";
import { ParsedObject } from "./ParsedObject";
import { ParsedPath } from "./ParsedPath";
import { ParsedReturn } from "./ParsedReturn";
import { ParsedWeave } from "./ParsedWeave";

// Base class for Knots and Stitches
export abstract class ParsedFlowBase
  extends ParsedObject
  implements INamedContent, IFlowBase
{
  identifier: Identifier = null;

  arguments: Argument[] = null;

  isFunction = false;

  variableDeclarations: Record<string, IVariableAssignment> = null;

  private _flowLevel: FlowLevel = FlowLevel.Story;

  private _rootWeave: IWeave = null;

  private _subFlowsByName: Record<string, ParsedFlowBase> = null;

  private _startingSubFlowDivert: Divert = null;

  private _startingSubFlowRuntime: RuntimeObject = null;

  private _firstChildFlow: ParsedFlowBase = null;

  get flowLevel(): FlowLevel {
    return this._flowLevel;
  }

  get subFlowsByName(): Record<string, ParsedFlowBase> {
    return this._subFlowsByName;
  }

  get typeName(): string {
    if (this.isFunction) {
      return "Function";
    }
    return FlowLevel[this.flowLevel];
  }

  get name(): string {
    return this.identifier?.name;
  }

  get hasParameters(): boolean {
    return this.arguments != null && this.arguments.length > 0;
  }

  constructor(
    name: Identifier = null,
    topLevelObjects: ParsedObject[] = null,
    args: Argument[] = null,
    isFunction = false,
    isIncludedStory = false
  ) {
    super();
    this.identifier = name;

    if (topLevelObjects == null) {
      topLevelObjects = [];
    }

    // Used by story to add includes
    this.PreProcessTopLevelObjects(topLevelObjects);

    topLevelObjects = this.SplitWeaveAndSubFlowContent(
      topLevelObjects,
      isStory(this) && !isIncludedStory
    );

    this.AddContent(topLevelObjects);

    this.arguments = args;
    this.isFunction = isFunction;
    this.variableDeclarations = {};
  }

  SplitWeaveAndSubFlowContent(
    contentObjs: ParsedObject[],
    isRootStory: boolean
  ): ParsedObject[] {
    const weaveObjs = [];
    const subFlowObjs = [];

    this._subFlowsByName = {};

    contentObjs.forEach((obj) => {
      const subFlow = obj;
      if (subFlow instanceof ParsedFlowBase) {
        if (this._firstChildFlow == null) {
          this._firstChildFlow = subFlow;
        }

        subFlowObjs.push(obj);
        this._subFlowsByName[subFlow.identifier?.name] = subFlow;
      } else {
        weaveObjs.push(obj);
      }
    });

    // Implicit final gather in top level story for ending without warning that you run out of content
    if (isRootStory) {
      weaveObjs.push(new ParsedGather(null, 1));
      weaveObjs.push(new ParsedDivert(new ParsedPath([DONE_IDENTIFIER])));
    }

    const finalContent: ParsedObject[] = [];

    if (weaveObjs.length > 0) {
      const newWeave = new ParsedWeave(weaveObjs, 0);
      this._rootWeave = newWeave;
      finalContent.push(newWeave);
    }

    if (subFlowObjs.length > 0) {
      finalContent.push(...subFlowObjs);
    }

    return finalContent;
  }

  protected PreProcessTopLevelObjects(_topLevelObjects: ParsedObject[]): void {
    // empty by default, used by Story to process included file references
  }

  ResolveVariableWithName(
    varName: string,
    fromNode: ParsedObject
  ): VariableResolveResult {
    const result: VariableResolveResult = {
      found: false,
      isGlobal: false,
      isArgument: false,
      isTemporary: false,
      ownerFlow: null,
    };

    // Search in the stitch / knot that owns the node first
    const ownerFlow = fromNode == null ? this : fromNode.ClosestFlowBase();

    // Argument
    if (ownerFlow.arguments != null) {
      for (let i = 0; i < ownerFlow.arguments.length; i += 1) {
        const arg = ownerFlow.arguments[i];
        if (arg.identifier.name === varName) {
          result.found = true;
          result.isArgument = true;
          result.ownerFlow = ownerFlow;
          return result;
        }
      }
    }

    // Temp
    const { story } = this; // optimization
    if (
      ownerFlow !== story &&
      ownerFlow.variableDeclarations[varName] !== undefined
    ) {
      result.found = true;
      result.ownerFlow = ownerFlow;
      result.isTemporary = true;
      return result;
    }

    // Global
    if (story.variableDeclarations[varName] !== undefined) {
      result.found = true;
      result.ownerFlow = story;
      result.isGlobal = true;
      return result;
    }

    result.found = false;
    return result;
  }

  TryAddNewVariableDeclaration(varDecl: IVariableAssignment): void {
    const varName = varDecl.variableName;
    if (this.variableDeclarations[varName] !== undefined) {
      let prevDeclError = "";
      const { debugMetadata } = this.variableDeclarations[varName];
      if (debugMetadata != null) {
        prevDeclError = ` (${this.variableDeclarations[varName].debugMetadata})`;
      }
      this.Error(
        `found declaration variable '${varName}' that was already declared${prevDeclError}`,
        varDecl,
        false
      );

      return;
    }

    this.variableDeclarations[varDecl.variableName] = varDecl;
  }

  ResolveWeavePointNaming(): void {
    // Find all weave points and organise them by name ready for
    // diverting. Also detect naming collisions.
    if (this._rootWeave) {
      this._rootWeave.ResolveWeavePointNaming();
    }

    if (this._subFlowsByName != null) {
      Object.values(this._subFlowsByName).forEach((namedSubFlow) => {
        namedSubFlow.ResolveWeavePointNaming();
      });
    }
  }

  override GenerateRuntimeObject(): RuntimeObject {
    let foundReturn: ParsedReturn = null;
    if (this.isFunction) {
      this.CheckForDisallowedFunctionFlowControl();
    }

    // Non-functon: Make sure knots and stitches don't attempt to use Return statement
    else if (
      this.flowLevel === FlowLevel.Knot ||
      this.flowLevel === FlowLevel.Stitch
    ) {
      foundReturn = this.Find<ParsedReturn>((d) => d instanceof ParsedReturn);
      if (foundReturn != null) {
        this.Error(
          `Return statements can only be used in knots that are declared as functions: == function ${this.identifier} ==`,
          foundReturn
        );
      }
    }

    const container = new Container();
    container.name = this.identifier?.name || null;

    if (this.story.countAllVisits) {
      container.visitsShouldBeCounted = true;
    }

    this.GenerateArgumentVariableAssignments(container);

    // Run through content defined for this knot/stitch:
    //  - First of all, any initial content before a sub-stitch
    //    or any weave content is added to the main content container
    //  - The first inner knot/stitch is automatically entered, while
    //    the others are only accessible by an explicit divert
    //       - The exception to this rule is if the knot/stitch takes
    //         parameters, in which case it can't be auto-entered.
    //  - Any Choices and Gathers (i.e. IWeavePoint) found are
    //    processsed by GenerateFlowContent.
    let contentIdx = 0;
    while (this.content != null && contentIdx < this.content.length) {
      const obj = this.content[contentIdx];

      // Inner knots and stitches
      if (obj instanceof ParsedFlowBase) {
        const childFlow = obj;

        const childFlowRuntime = childFlow.runtimeObject;

        // First inner stitch - automatically step into it
        // 20/09/2016 - let's not auto step into knots
        if (
          contentIdx === 0 &&
          !childFlow.hasParameters &&
          this.flowLevel === FlowLevel.Knot
        ) {
          this._startingSubFlowDivert = new Divert();
          container.AddContent(this._startingSubFlowDivert);
          this._startingSubFlowRuntime = childFlowRuntime;
        }

        // Check for duplicate knots/stitches with same name
        const namedChild = childFlowRuntime;
        if (isNamedContent(namedChild)) {
          const existingChild: INamedContent =
            container.namedContent[namedChild.name];
          if (existingChild) {
            const errorMsg = `FlowBase already contains flow named '${
              namedChild.name
            }' (at ${
              (existingChild as unknown as RuntimeObject).debugMetadata
            })`;
            this.Error(errorMsg, childFlow);
          }

          container.AddToNamedContentOnly(namedChild);
        }
      }

      // Other content (including entire Weaves that were grouped in the constructor)
      // At the time of writing, all FlowBases have a maximum of one piece of "other content"
      // and it's always the root Weave
      else {
        container.AddContent(obj.runtimeObject);
      }

      contentIdx += 1;
    }

    // CHECK FOR FINAL LOOSE ENDS!
    // Notes:
    //  - Functions don't need to terminate - they just implicitly return
    //  - If return statement was found, don't continue finding warnings for missing control flow,
    // since it's likely that a return statement has been used instead of a ->-> or something,
    // or the writer failed to mark the knot as a function.
    //  - _rootWeave may be null if it's a knot that only has stitches
    if (
      this.flowLevel !== FlowLevel.Story &&
      !this.isFunction &&
      this._rootWeave != null &&
      foundReturn == null
    ) {
      this._rootWeave.ValidateTermination((terminatingObj: ParsedObject) =>
        this.WarningInTermination(terminatingObj)
      );
    }

    return container;
  }

  GenerateArgumentVariableAssignments(container: Container): void {
    if (this.arguments == null || this.arguments.length === 0) {
      return;
    }

    // Assign parameters in reverse since they'll be popped off the evaluation stack
    // No need to generate EvalStart and EvalEnd since there's nothing being pushed
    // back onto the evaluation stack.
    for (let i = this.arguments.length - 1; i >= 0; i -= 1) {
      const paramName = this.arguments[i].identifier?.name;

      const assign = new VariableAssignment(paramName, true);
      container.AddContent(assign);
    }
  }

  ContentWithNameAtLevel(
    name: string,
    level: FlowLevel = null,
    deepSearch = false
  ): ParsedObject {
    // Referencing self?
    if (level === this.flowLevel || level == null) {
      if (name === this.identifier?.name) {
        return this;
      }
    }

    if (level === FlowLevel.WeavePoint || level == null) {
      let weavePointResult: IWeavePoint = null;

      if (this._rootWeave) {
        weavePointResult = this._rootWeave.WeavePointNamed(name);
        if (weavePointResult) {
          return weavePointResult as unknown as ParsedObject;
        }
      }

      // Stop now if we only wanted a result if it's a weave point?
      if (level === FlowLevel.WeavePoint)
        return deepSearch ? this.DeepSearchForAnyLevelContent(name) : null;
    }

    // If this flow would be incapable of containing the requested level, early out
    // (e.g. asking for a Knot from a Stitch)
    if (level != null && level < this.flowLevel) return null;

    const subFlow: ParsedFlowBase = this._subFlowsByName[name];
    if (subFlow) {
      if (level == null || level === subFlow.flowLevel) {
        return subFlow;
      }
    }

    return deepSearch ? this.DeepSearchForAnyLevelContent(name) : null;
  }

  DeepSearchForAnyLevelContent(name: string): ParsedObject {
    const weaveResultSelf = this.ContentWithNameAtLevel(
      name,
      FlowLevel.WeavePoint,
      false
    );
    if (weaveResultSelf) {
      return weaveResultSelf;
    }

    const subflows = Object.values(this._subFlowsByName);

    for (let i = 0; i < subflows.length; i += 1) {
      const subFlow = subflows[i];
      const deepResult = subFlow.ContentWithNameAtLevel(name, null, true);
      if (deepResult) {
        return deepResult;
      }
    }

    return null;
  }

  override ResolveReferences(context: IStory): void {
    if (this._startingSubFlowDivert) {
      this._startingSubFlowDivert.targetPath =
        this._startingSubFlowRuntime.path;
    }

    super.ResolveReferences(context);

    // Check validity of parameter names
    if (this.arguments != null) {
      this.arguments.forEach((arg) => {
        context.CheckForNamingCollisions(
          this,
          arg.identifier,
          SymbolType.Arg,
          "argument"
        );
      });

      // Separately, check for duplicate arugment names, since they aren't Parsed.Objects,
      // so have to be checked independently.
      for (let i = 0; i < this.arguments.length; i += 1) {
        for (let j = i + 1; j < arguments.length; j += 1) {
          if (
            this.arguments[i].identifier?.name ===
            this.arguments[j].identifier?.name
          ) {
            this.Error(
              `Multiple arguments with the same name: '${this.arguments[i].identifier}'`
            );
          }
        }
      }
    }

    // Check naming collisions for knots and stitches
    if (this.flowLevel !== FlowLevel.Story) {
      // Weave points aren't FlowBases, so this will only be knot or stitch
      const symbolType =
        this.flowLevel === FlowLevel.Knot
          ? SymbolType.Knot
          : SymbolType.SubFlowAndWeave;
      context.CheckForNamingCollisions(this, this.identifier, symbolType);
    }
  }

  CheckForDisallowedFunctionFlowControl(): void {
    if (!(this instanceof ParsedKnot)) {
      this.Error(
        "Functions cannot be stitches - i.e. they should be defined as '== function myFunc ==' rather than public to another knot."
      );
    }

    // Not allowed sub-flows
    Object.entries(this._subFlowsByName).forEach(([name, subFlow]) => {
      this.Error(
        `Functions may not contain stitches, but saw '${name}' within the function '${this.identifier}'`,
        subFlow
      );
    });

    const allDiverts = this._rootWeave.FindAll<ParsedDivert>(
      (d) => d instanceof ParsedDivert
    );
    allDiverts.forEach((divert) => {
      if (
        !divert.isFunctionCall &&
        !(divert.parent instanceof ParsedDivertTarget)
      ) {
        this.Error(
          `Functions may not contain diverts, but saw '${divert.ToString()}'`,
          divert
        );
      }
    });

    const allChoices = this._rootWeave.FindAll<ParsedChoice>(
      (d) => d instanceof ParsedChoice
    );
    allChoices.forEach((choice) => {
      this.Error(
        `Functions may not contain choices, but saw '${choice.ToString()}'`,
        choice
      );
    });
  }

  WarningInTermination(terminatingObject: ParsedObject): void {
    let message =
      "Apparent loose end exists where the flow runs out. Do you need a '-> DONE' statement, choice or divert?";
    if (terminatingObject.parent === this._rootWeave && this._firstChildFlow) {
      message = `${message} Note that if you intend to enter '${this._firstChildFlow.identifier}' next, you need to divert to it explicitly.`;
    }

    const terminatingDivert = terminatingObject;
    if (
      terminatingDivert instanceof ParsedDivert &&
      terminatingDivert.isTunnel
    ) {
      message = `${message} When final tunnel to '${terminatingDivert.target} ->' returns it won't have anywhere to go.`;
    }

    this.Warning(message, terminatingObject);
  }

  override ToString(): string {
    return `${this.typeName} '${this.identifier}'`;
  }
}
