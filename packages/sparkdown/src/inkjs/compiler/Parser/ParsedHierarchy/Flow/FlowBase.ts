import { Argument } from "../Argument";
import { Choice } from "../Choice";
import { Divert } from "../Divert/Divert";
import { DivertTarget } from "../Divert/DivertTarget";
import { FlowLevel } from "./FlowLevel";
import { Gather } from "../Gather/Gather";
import { INamedContent } from "../../../../engine/INamedContent";
// import { Knot } from '../Knot';
import { ParsedObject } from "../Object";
import { Path } from "../Path";
import { ReturnType } from "../ReturnType";
import { Container as RuntimeContainer } from "../../../../engine/Container";
import { Divert as RuntimeDivert } from "../../../../engine/Divert";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { VariableAssignment as RuntimeVariableAssignment } from "../../../../engine/VariableAssignment";
//import { Story } from '../Story';
import { SymbolType } from "../SymbolType";
import { VariableAssignment } from "../Variable/VariableAssignment";
import { Weave } from "../Weave";
import { ClosestFlowBase } from "./ClosestFlowBase";
import { Identifier } from "../Identifier";
import { asOrNull } from "../../../../engine/TypeAssertion";
import { DebugMetadata } from "../../../../engine/DebugMetadata";

type VariableResolveResult = {
  found: boolean;
  isGlobal: boolean;
  isArgument: boolean;
  isTemporary: boolean;
  ownerFlow: FlowBase;
};

// Base class for Knots and Stitches
export abstract class FlowBase extends ParsedObject implements INamedContent {
  public abstract readonly flowLevel: FlowLevel;

  public _rootWeave: Weave | null = null;
  public _subFlowsByName: Map<string, FlowBase> = new Map();
  public _startingSubFlowDivert: RuntimeDivert | null = null;
  public _startingSubFlowRuntime: RuntimeObject | null = null;
  public _firstChildFlow: FlowBase | null = null;
  public variableDeclarations: Map<string, VariableAssignment> = new Map();

  get hasParameters() {
    return this.args !== null && this.args.length > 0;
  }

  get subFlowsByName() {
    return this._subFlowsByName;
  }

  get typeName(): string {
    if (this.isFunction) {
      return "Function";
    }

    return String(this.flowLevel);
  }

  get name(): string | null {
    return this.identifier?.name || null;
  }

  public args: Argument[] | null = null;

  constructor(
    identifier: Identifier | null,
    topLevelObjects: ParsedObject[] | null = null,
    args: Argument[] | null = null,
    public readonly isFunction: boolean = false,
    isIncludedStory: boolean = false,
  ) {
    super();

    this.identifier = identifier;
    this.args = args;

    if (topLevelObjects === null) {
      topLevelObjects = [];
    }

    // Used by story to add includes
    this.PreProcessTopLevelObjects(topLevelObjects);

    topLevelObjects = this.SplitWeaveAndSubFlowContent(
      topLevelObjects,
      this.GetType() == "Story" && !isIncludedStory,
    );

    this.AddContent(topLevelObjects);
  }

  public iamFlowbase = () => true;

  public readonly SplitWeaveAndSubFlowContent = (
    contentObjs: ParsedObject[],
    isRootStory: boolean,
  ): ParsedObject[] => {
    const weaveObjs: ParsedObject[] = [];
    const subFlowObjs: ParsedObject[] = [];

    this._subFlowsByName = new Map();

    for (const obj of contentObjs) {
      const subFlow = asOrNull(obj, FlowBase);
      if (subFlow) {
        if (this._firstChildFlow === null) {
          this._firstChildFlow = subFlow;
        }

        subFlowObjs.push(obj);
        if (subFlow.identifier?.name) {
          this._subFlowsByName.set(subFlow.identifier?.name, subFlow);
        }
      } else {
        weaveObjs.push(obj);
      }
    }

    // Implicit final gather in top level story for ending without warning that you run out of content
    if (isRootStory) {
      weaveObjs.push(new Gather(null, 1), new Divert([Identifier.Done()]));
    }

    const finalContent: ParsedObject[] = [];

    if (weaveObjs.length > 0) {
      this._rootWeave = new Weave(weaveObjs, 0);
      finalContent.push(this._rootWeave);
    }

    if (subFlowObjs.length > 0) {
      finalContent.push(...subFlowObjs);
    }
    return finalContent;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public PreProcessTopLevelObjects(_: ParsedObject[]): void {
    // empty by default, used by Story to process included file references
  }

  public VariableResolveResult?: VariableResolveResult | null | undefined;

  public ResolveVariableWithName = (
    varName: string,
    fromNode: ParsedObject,
  ): VariableResolveResult => {
    const result: VariableResolveResult = {} as any;

    // Search in the stitch / knot that owns the node first
    const ownerFlow = fromNode === null ? this : ClosestFlowBase(fromNode);

    if (ownerFlow) {
      // Argument
      if (ownerFlow.args !== null) {
        for (const arg of ownerFlow.args) {
          if (arg.identifier?.name === varName) {
            result.found = true;
            result.isArgument = true;
            result.ownerFlow = ownerFlow;
            return result;
          }
        }
      }

      // Temp
      if (
        ownerFlow !== this.story &&
        ownerFlow.variableDeclarations.has(varName)
      ) {
        result.found = true;
        result.ownerFlow = ownerFlow;
        result.isTemporary = true;

        return result;
      }
    }

    // Global
    if (this.story.variableDeclarations.has(varName)) {
      result.found = true;
      result.ownerFlow = this.story;
      result.isGlobal = true;

      return result;
    }

    result.found = false;

    return result;
  };

  public AddNewVariableDeclaration = (varDecl: VariableAssignment): void => {
    const varName = varDecl.variableName;
    if (this.variableDeclarations.has(varName)) {
      const varab = this.variableDeclarations.get(varName)!;

      // Same-name defines of DIFFERENT engine types coexist — e.g.
      // `define raffles as character` + `define raffles as synth`. They
      // register as type-namespaced structs (context.character.raffles /
      // context.synth.raffles, picked up via FindAll(StructDefinition)),
      // not a single flat global, so this isn't a real collision. (Two
      // defines of the SAME type, or a define vs a plain var, still error.)
      const newType = varDecl.structDefinition?.type?.name;
      const existingType = varab.structDefinition?.type?.name;
      if (
        varDecl.isDefineDeclaration &&
        varab.isDefineDeclaration &&
        newType &&
        existingType &&
        newType !== existingType
      ) {
        // The second define keeps its type-namespaced struct (emitted via
        // the lowerer's `context`), but loses the flat global slot. Mark
        // it so its `ResolveReferences` is skipped — its `__def` expression
        // was never generated (not in `variableDeclarations`), so resolving
        // its `-> __def` divert would throw and abort the whole resolve
        // pass. See VariableAssignment.isSuppressedDuplicateDefine.
        varDecl.isSuppressedDuplicateDefine = true;
        return;
      }

      if (!varDecl.isPropertyDeclaration) {
        this.Error(
          `Duplicate identifier \`${varName}\`. A ${varab.typeName.toLowerCase()} named \`${varName}\` already exists on ${
            varab.debugMetadata
          }`,
          varDecl.identifier.debugMetadata,
        );
      }

      return;
    }

    this.variableDeclarations.set(varDecl.variableName, varDecl);
  };

  public ResolveWeavePointNaming = (): void => {
    // Find all weave points and organise them by name ready for
    // diverting. Also detect naming collisions.
    if (this._rootWeave) {
      this._rootWeave.ResolveWeavePointNaming();
    }

    for (const [, value] of this._subFlowsByName) {
      if (value.hasOwnProperty("ResolveWeavePointNaming")) {
        value.ResolveWeavePointNaming();
      }
    }
  };

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    let foundReturn: ReturnType | null = null;
    if (this.isFunction) {
      this.CheckForDisallowedFunctionFlowControl();
    } else if (
      this.flowLevel === FlowLevel.Knot ||
      this.flowLevel === FlowLevel.Stitch
    ) {
      // Non-functon: Make sure knots and stitches don't attempt to use Return statement
      foundReturn = this.Find(ReturnType)();

      if (foundReturn !== null) {
        this.Error(
          `Return statements can only be used in knots that are declared as functions: == function ${this.identifier} ==`,
          foundReturn,
        );
      }
    } else if (this.flowLevel === FlowLevel.Story) {
      // Top-level: `return` is only valid inside a function body. A
      // bare `return` at file scope is almost always a mistake — the
      // `PopFunction` it emits has nothing to pop, since there's no
      // function-call frame active. InkParser rejected the form at
      // parse time; sparkdown's textmate grammar accepts `return X`
      // anywhere a statement is legal, so the validation lands here
      // at runtime-export time.
      //
      // `_rootWeave` holds the Story's free-floating top-level content
      // (everything outside a `scene` / `branch` / `function`). Inkjs's
      // `Knot` / `Stitch` checks above use `Find(ReturnType)` which
      // would recurse into child flows; here we scope to `_rootWeave`
      // to avoid double-flagging returns inside child functions (which
      // are nested FlowBases that handle their own checks).
      if (this._rootWeave !== null) {
        const rootReturn = this._rootWeave.Find(ReturnType)();
        if (rootReturn !== null) {
          this.Error(
            `Return statements can only be used inside a function body — found one at file scope.`,
            rootReturn,
          );
        }
      }
    }

    const container = new RuntimeContainer();
    container.name = this.identifier?.name as string;

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
    let contentIdx: number = 0;
    while (this.content !== null && contentIdx < this.content.length) {
      const obj: ParsedObject = this.content[contentIdx];

      // Inner knots and stitches
      if (obj instanceof FlowBase) {
        const childFlow: FlowBase = obj;
        const childFlowRuntime = childFlow.runtimeObject;

        // First inner stitch - automatically step into it
        // 20/09/2016 - let's not auto step into knots
        if (
          contentIdx === 0 &&
          !childFlow.hasParameters &&
          this.flowLevel === FlowLevel.Knot
        ) {
          this._startingSubFlowDivert = new RuntimeDivert();
          container.AddContent(this._startingSubFlowDivert);
          this._startingSubFlowRuntime = childFlowRuntime;
        }

        // Check for duplicate knots/stitches with same name
        const namedChild = childFlowRuntime as RuntimeObject & INamedContent;
        const existingChild: INamedContent | null =
          container.namedContent.get(namedChild.name!) || null;

        if (existingChild) {
          const errorMsg = `Duplicate identifier \`${
            namedChild.name
          }\`. ${this.GetType()} already contains flow named \`${
            namedChild.name
          }\` on ${(existingChild as any as RuntimeObject).debugMetadata}`;
          this.Error(errorMsg, childFlow?.identifier || childFlow);
        }

        container.AddToNamedContentOnly(namedChild);
      } else if (obj) {
        // Other content (including entire Weaves that were grouped in the constructor)
        // At the time of writing, all FlowBases have a maximum of one piece of "other content"
        // and it's always the root Weave
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
    // if (
    //   this.flowLevel !== FlowLevel.Story &&
    //   !this.isFunction &&
    //   this._rootWeave !== null &&
    //   foundReturn === null
    // ) {
    //   this._rootWeave.ValidateTermination(this.WarningInTermination);
    // }

    return container;
  };

  public readonly GenerateArgumentVariableAssignments = (
    container: RuntimeContainer,
  ): void => {
    if (this.args === null || this.args.length === 0) {
      return;
    }

    // Assign parameters in reverse since they'll be popped off the evaluation stack
    // No need to generate EvalStart and EvalEnd since there's nothing being pushed
    // back onto the evaluation stack.
    for (let ii = this.args.length - 1; ii >= 0; --ii) {
      const arg = this.args[ii];
      const paramName = arg.identifier?.name || null;
      const assign = new RuntimeVariableAssignment(
        paramName,
        true,
        !!arg.isVararg,
      );
      container.AddContent(assign);
    }
  };

  public readonly ContentWithNameAtLevel = (
    name: string,
    level: FlowLevel | null = null,
    deepSearch: boolean = false,
  ): ParsedObject | null => {
    // The `level` parameter is interpreted as a *minimum* — i.e. the
    // matched item's level must be `>= level`. This lets path
    // resolution descend through an intermediate FlowLevel (e.g.
    // Function) when looking for something deeper (e.g. a labeled
    // weave point). Older code treated it as exact-match; with the
    // introduction of `FlowLevel.Function` between Stitch and
    // WeavePoint, exact-match would leave WeavePoints unreachable
    // when the caller asked for "anything below a Stitch" (which
    // resolves to `Function` via the `+1` rule in Path).
    const ambiguousLevel = level === null;

    // Referencing self? Self is a candidate iff it's at the asked
    // level (self is not "deeper" than itself, so exact match here).
    if (ambiguousLevel || level === this.flowLevel) {
      if (name === this.identifier?.name) {
        return this;
      }
    }

    // Weave points live in this._rootWeave and are at level WeavePoint.
    // They satisfy any `level <= WeavePoint` search.
    if (ambiguousLevel || level! <= FlowLevel.WeavePoint) {
      if (this._rootWeave) {
        const weavePointResult = this._rootWeave.WeavePointNamed(
          name,
        ) as ParsedObject;
        if (weavePointResult) {
          return weavePointResult;
        }
      }

      // If the caller specifically asked for a WeavePoint, give up
      // here — the only place a WeavePoint could be has been checked.
      if (level === FlowLevel.WeavePoint) {
        return deepSearch ? this.DeepSearchForAnyLevelContent(name) : null;
      }
    }

    // If this flow would be incapable of containing the requested level, early out
    // (e.g. asking for a Knot from a Stitch).
    if (!ambiguousLevel && level! < this.flowLevel) {
      return null;
    }

    const subFlow: FlowBase | null = this._subFlowsByName.get(name) || null;

    if (subFlow && (ambiguousLevel || subFlow.flowLevel >= level!)) {
      return subFlow;
    }

    return deepSearch ? this.DeepSearchForAnyLevelContent(name) : null;
  };

  public readonly DeepSearchForAnyLevelContent = (name: string) => {
    const weaveResultSelf = this.ContentWithNameAtLevel(
      name,
      FlowLevel.WeavePoint,
      false,
    );

    if (weaveResultSelf) {
      return weaveResultSelf;
    }

    for (const [, value] of this._subFlowsByName) {
      const deepResult = value.ContentWithNameAtLevel(name, null, true);

      if (deepResult) {
        return deepResult;
      }
    }

    return null;
  };

  public override ResolveReferences(context: any): void {
    if (this._startingSubFlowDivert) {
      if (!this._startingSubFlowRuntime) {
        throw new Error();
      }

      this._startingSubFlowDivert.targetPath =
        this._startingSubFlowRuntime.path;
    }

    super.ResolveReferences(context);

    // Check validity of parameter names
    if (this.args !== null) {
      for (const arg of this.args) {
        context.CheckForNamingCollisions(
          this,
          arg.identifier,
          SymbolType.Arg,
          "argument",
        );
      }

      // Separately, check for duplicate arugment names, since they aren't Parsed.Objects,
      // so have to be checked independently.
      for (let ii = 0; ii < this.args.length; ii += 1) {
        for (let jj = ii + 1; jj < this.args.length; jj += 1) {
          if (
            this.args[ii].identifier?.name == this.args[jj].identifier?.name
          ) {
            this.Error(
              `Multiple arguments with the same name: \`${this.args[ii].identifier}\``,
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

  public readonly CheckForDisallowedFunctionFlowControl = (): void => {
    // Top-level functions parse as a Knot with `isFunction=true`.
    // Nested functions parse as a `Function` (which always has
    // `isFunction=true`). Anything else carrying `isFunction=true` is
    // a misconfiguration — e.g. a Stitch being treated as a function.
    if (
      this.flowLevel !== FlowLevel.Knot &&
      this.flowLevel !== FlowLevel.Function
    ) {
      this.Error(
        "Functions cannot be stitches - i.e. they should be defined as '== function myFunc ==' rather than internal to another knot.",
      );
    }

    // Non-function subflows aren't allowed in a function. Nested
    // Functions are, since `Function` is the primitive for inline /
    // nested callables (anonymous fns, nested function definitions,
    // class methods).
    for (const [key, value] of this._subFlowsByName) {
      if (value.flowLevel === FlowLevel.Function) continue;
      this.Error(
        `Functions may not contain stitches, but saw \`${key}\` within the function \`${this.identifier}\``,
        value,
      );
    }

    // Empty function bodies (`function() end`) produce no _rootWeave
    // — there's no content to construct one from. That's a valid Lua
    // form (returns nothing, takes no effect), so just skip the
    // contained-divert / contained-return checks below; there's
    // nothing to check.
    if (!this._rootWeave) {
      return;
    }

    const allDiverts = this._rootWeave.FindAll<Divert>(Divert)();
    for (const divert of allDiverts) {
      if (!divert.isFunctionCall && !(divert.parent instanceof DivertTarget)) {
        // Allow non-function-call diverts whose target is a weave point
        // internal to this function. The runtime divert is a pointer
        // move within the function's container hierarchy — it does NOT
        // pop the function frame or leak control outside the function.
        // Loop lowering emits this shape (e.g. `while` -> labeled
        // gather).
        if (this.divertTargetsInternalWeavePoint(divert)) {
          continue;
        }
        this.Error(
          `Functions may not contain diverts, but saw \`${divert}\``,
          divert,
        );
      }
    }

    const allChoices = this._rootWeave.FindAll<Choice>(Choice)();
    for (const choice of allChoices) {
      this.Error(
        `Functions may not contain choices, but saw \`${choice}\``,
        choice,
      );
    }
  };

  // True iff `divert`'s target is a weave point (gather/choice) that
  // lives inside this function's own rootWeave. Used to allow
  // back-jumps emitted by loop lowering — those stay within the
  // function's container hierarchy at runtime, so they don't violate
  // function purity.
  public readonly divertTargetsInternalWeavePoint = (
    divert: Divert,
  ): boolean => {
    if (!this._rootWeave) return false;
    const target = divert.target;
    if (!target || target.numberOfComponents !== 1) return false;
    const targetName = target.firstComponent;
    if (!targetName) return false;
    if (this._rootWeave.WeavePointNamed(targetName)) return true;
    const nestedWeaves = this._rootWeave.FindAll<Weave>(Weave)();
    for (const w of nestedWeaves) {
      if (w.WeavePointNamed(targetName)) return true;
    }
    return false;
  };

  public readonly WarningInTermination = (terminatingObject: ParsedObject) => {
    let message: string =
      "Apparent loose end exists where the flow runs out. Do you need a '-> DONE' statement, choice or divert?";
    if (terminatingObject.parent === this._rootWeave && this._firstChildFlow) {
      message = `${message} Note that if you intend to enter \`${this._firstChildFlow.identifier}\` next, you need to divert to it explicitly.`;
    }

    const terminatingDivert = asOrNull(terminatingObject, Divert);
    if (terminatingDivert && terminatingDivert.isTunnel) {
      message += ` When final tunnel to \`${terminatingDivert.target} ->\` returns it won't have anywhere to go.`;
    }

    if (terminatingObject) {
      const debugMetadata = new DebugMetadata(
        terminatingObject?.debugMetadata || undefined,
      );
      debugMetadata.startLineNumber = debugMetadata.endLineNumber;
      debugMetadata.startCharacterNumber = debugMetadata.endCharacterNumber;
      this.Warning(message, debugMetadata);
    }
  };

  public readonly toString = (): string =>
    `${this.typeName} \`${this.identifier}\``;
}
