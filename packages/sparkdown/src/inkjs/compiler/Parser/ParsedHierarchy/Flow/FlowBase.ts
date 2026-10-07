import { Argument } from "../Argument";
import { Choice } from "../Choice";
import { Divert } from "../Divert/Divert";
import { DivertTarget } from "../Divert/DivertTarget";
import { FlowLevel } from "./FlowLevel";
import { Gather } from "../Gather/Gather";
import type { INamedContent } from "../../../../engine/INamedContent";
// import { Knot } from '../Knot';
import { ParsedObject } from "../Object";
import { ReturnType } from "../ReturnType";
import { MultiReturnType } from "../MultiReturnType";
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
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { Wrap } from "../Wrap";
import { Conditional } from "../Conditional/Conditional";
import { RecordingMap, recordRead, resolutionTap } from "../ResolutionTap";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";

// Where the enclosing code creates the value of `flow`, a function the
// lowering names itself (an anonymous function, a `local function`, a
// `function a.f` or `function a:m` definition) and gives no position: just
// before the function value that names `flow`, which the lowering writes
// once, where the source creates the function, beside the pointers to the
// variables it captures. Null when no function value names `flow`.
function functionValueSite(
  story: ParsedObject,
  flow: FlowBase,
): { parent: ParsedObject; end: number } | null {
  const flowName = flow.identifier?.name;
  // The program path's resolver knows each statement's function values.
  const known = flowName ? resolutionTap()?.functionValue(flowName) : undefined;
  if (known !== undefined) {
    return known?.parent
      ? { parent: known.parent, end: known.parent.content.indexOf(known) }
      : null;
  }
  const find = (obj: ParsedObject): ParsedObject | null => {
    for (const child of obj.content) {
      if (
        child instanceof DivertTarget &&
        child.isFunctionValue &&
        child.divert.target?.dotSeparatedComponents === flowName
      ) {
        return child;
      }
      const found = find(child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const value = flowName ? find(story) : null;
  return value?.parent
    ? { parent: value.parent, end: value.parent.content.indexOf(value) }
    : null;
}

// Where the sub-flow `flow` is written among the content of its parent flow,
// found from the flow's source position. Null when the parent has no weave
// or the flow no position.
//
// A flow is bounded by the first object of the parent's weave, from the same
// script, that starts after it, or by the object it followed when the parent
// split its content (`_definedAfter`), whichever comes first in a walk of the
// weave that visits each object before what it holds. That is exact for the
// story and for a scene, knot or stitch: a flow written as a statement of
// their content joins it after all of it and is outside every block, so the
// first object after it bounds it, and a flow written inside a top-level `do`
// block keeps its place among the block's objects, so the object it followed
// bounds it. It is exact too for a function nested in a function outside
// every block of it (`_outsideBlocks`).
//
// A function nested in a function inside a block of it also joins the
// content after all of it, and a conditional's position covers only its
// first line, so nothing shows whether the flow is in the conditional or
// after it. Such a flow is placed just after the last object that ends
// before it, entering every conditional and every object that encloses its
// position. When the flow comes right after an `if` or loop statement that
// declared the local, with no statement between, the local then counts as in
// scope: the check misses that warning rather than reporting one for a local
// that is in scope.
function definitionSite(
  parentFlow: FlowBase,
  flow: FlowBase,
): { parent: ParsedObject; end: number } | null {
  const root = parentFlow._rootWeave;
  const start = flow.ownDebugMetadata ?? flow.identifier?.debugMetadata;
  if (!root || !start) {
    return null;
  }
  const startsAfter = (dm: DebugMetadata) =>
    dm.fileName === start.fileName &&
    (dm.startLineNumber > start.startLineNumber ||
      (dm.startLineNumber === start.startLineNumber &&
        dm.startCharacterNumber > start.startCharacterNumber));
  const endsBefore = (dm: DebugMetadata) =>
    dm.fileName !== start.fileName ||
    dm.endLineNumber < start.startLineNumber ||
    (dm.endLineNumber === start.startLineNumber &&
      dm.endCharacterNumber <= start.startCharacterNumber);
  const position = (obj: ParsedObject) =>
    obj.ownDebugMetadata ?? obj.identifier?.debugMetadata;

  if (parentFlow.isFunction && !flow._outsideBlocks) {
    let lastBefore = null as ParsedObject | null;
    let passed = false;
    const visit = (obj: ParsedObject) => {
      for (const child of obj.content) {
        if (passed) {
          return;
        }
        if (child instanceof FlowBase) {
          continue;
        }
        const childStart = position(child);
        if (!childStart) {
          visit(child);
        } else if (startsAfter(childStart)) {
          passed = true;
        } else if (child instanceof Conditional || !endsBefore(childStart)) {
          visit(child);
        } else {
          lastBefore = child;
        }
      }
    };
    visit(root);
    return lastBefore?.parent
      ? {
          parent: lastBefore.parent,
          end: lastBefore.parent.content.indexOf(lastBefore) + 1,
        }
      : { parent: root, end: 0 };
  }

  const order: ParsedObject[] = [];
  let firstAfter = null as ParsedObject | null;
  const note = (child: ParsedObject) => {
    order.push(child);
    const childStart = position(child);
    if (childStart && firstAfter === null && startsAfter(childStart)) {
      firstAfter = child;
    }
  };
  const visit = (obj: ParsedObject) => {
    for (const child of obj.content) {
      if (child instanceof FlowBase) {
        continue;
      }
      note(child);
      if (!position(child)) {
        // The program path's resolver knows what this walk finds under an
        // object a statement holds at its top (`ResolutionTap.unplaced`).
        const known = resolutionTap()?.unplaced(child);
        if (known) {
          for (const under of known) {
            note(under);
          }
        } else {
          visit(child);
        }
      }
    }
  };
  visit(root);
  const after = flow._definedAfter;
  const afterIndex = after ? order.indexOf(after) : -1;
  const firstAfterIndex = firstAfter
    ? order.indexOf(firstAfter)
    : order.length;
  if (after?.parent && afterIndex >= 0 && afterIndex < firstAfterIndex) {
    return {
      parent: after.parent,
      end: after.parent.content.indexOf(after) + 1,
    };
  }
  if (firstAfter?.parent) {
    return {
      parent: firstAfter.parent,
      end: firstAfter.parent.content.indexOf(firstAfter),
    };
  }
  return { parent: root, end: root.content.length };
}

// Whether `content[0..end)` declares a `local` named `varName` that is still
// in scope at `end`. The objects are scanned backwards, and everything
// between an `EndScope` and its `BeginScope` is skipped: that block closed
// before `end`. A conditional is skipped too, since every branch of one is a
// block (an `if` arm or a `while` body). Other objects are searched the same way, since a
// declaration can sit inside an object that opens no block, such as a
// multiple assignment or the label gather of a `repeat` body. A function is
// a flow of its own and is never searched.
//
// The program path's resolver knows the locals an object a statement holds
// at its top declares there (`ResolutionTap.declaredLocals`), read once when
// the statement is lowered, so a search through the statements before a
// reference visits none of them.
function declaresLocal(
  content: ParsedObject[],
  end: number,
  varName: string,
): boolean {
  for (const obj of openObjects(content, end)) {
    if (
      obj instanceof VariableAssignment &&
      obj.isNewTemporaryDeclaration &&
      obj.variableName === varName
    ) {
      return true;
    }
    const known = resolutionTap()?.declaredLocals(obj);
    if (
      known
        ? known.has(varName)
        : declaresLocal(obj.content, obj.content.length, varName)
    ) {
      return true;
    }
  }
  return false;
}

/** The names of the locals `content[0..end)` declares that are still in
 *  scope at `end`, as `declaresLocal` finds them, added to `into`. `of`
 *  gives an object's own (`localsDeclaredIn` of its whole content) when the
 *  caller already knows it. */
export function localsDeclaredIn(
  content: ParsedObject[],
  end: number,
  into = new Set<string>(),
  of?: (obj: ParsedObject) => ReadonlySet<string>,
): Set<string> {
  for (const obj of openObjects(content, end)) {
    if (obj instanceof VariableAssignment && obj.isNewTemporaryDeclaration) {
      into.add(obj.variableName);
    }
    if (of) {
      for (const name of of(obj)) {
        into.add(name);
      }
    } else {
      localsDeclaredIn(obj.content, obj.content.length, into);
    }
  }
  return into;
}

// The objects of `content[0..end)` that `declaresLocal` searches, last
// first: those outside every block that closes before `end`, every
// conditional and every function.
function* openObjects(
  content: ParsedObject[],
  end: number,
): Generator<ParsedObject> {
  let closedScopes = 0;
  for (let i = end - 1; i >= 0; i--) {
    const obj = content[i]!;
    if (obj instanceof Wrap) {
      const command = asOrNull(
        obj.GenerateRuntimeObject(),
        RuntimeControlCommand,
      )?.commandType;
      if (command === RuntimeControlCommand.CommandType.EndScope) {
        closedScopes++;
      } else if (
        command === RuntimeControlCommand.CommandType.BeginScope &&
        closedScopes > 0
      ) {
        closedScopes--;
      }
    } else if (
      closedScopes === 0 &&
      !(obj instanceof FlowBase) &&
      !(obj instanceof Conditional)
    ) {
      yield obj;
    }
  }
}

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
  // Set when the flow's own declaration holds its whole body, closed by its
  // `end` or by a following `scene` or `branch`, so the chunks after the
  // declaration are not part of it.
  public _bodyClosed = false;
  // The flow the lowering made of this flow's declaration, which the
  // assembly builds this one from: a scene's or a branch's, or a function
  // declared at the top level, whose flow the compile builds anew every
  // time. It is carried with the declaration's statement, and the program
  // path's resolver knows the flow by it (`ProgramResolver`).
  public _loweredFrom: FlowBase | null = null;
  public _subFlowsByName: Map<string, FlowBase> = this.subFlowTable();
  public _startingSubFlowDivert: RuntimeDivert | null = null;
  public _startingSubFlowRuntime: RuntimeObject | null = null;
  public _firstChildFlow: FlowBase | null = null;
  // The object this flow followed in its parent's content when the parent
  // split that content into its weave and its flows. A flow written inside a
  // top-level block keeps its place among the block's objects; a flow written
  // as a top-level statement joins the content after all of it, so this is
  // the last object of the weave. See `definitionSite`.
  public _definedAfter: ParsedObject | null = null;
  // Set by the lowering on a function nested in another function when it is
  // written directly in that function's body, outside every block of it.
  // See `definitionSite`.
  public _outsideBlocks = false;
  public variableDeclarations: Map<string, VariableAssignment> =
    FlowBase.declarationTable();

  /** A table of the flow's sub-flows by name, whose lookups a resolution of
   *  the program path records (`RecordingMap`). Going through it whole reads
   *  every flow it holds, which a flow added under this one changes. */
  public subFlowTable(): Map<string, FlowBase> {
    return new RecordingMap(() => `flows:${this.identifier?.name ?? ""}`);
  }

  /** A table of the flow's declarations by name, whose lookups a resolution
   *  of the program path records (`RecordingMap`). */
  public static declarationTable(
    entries?: Iterable<readonly [string, VariableAssignment]>,
  ): Map<string, VariableAssignment> {
    return new RecordingMap(() => "vars", entries);
  }

  get hasParameters() {
    return this.args !== null && this.args.length > 0;
  }

  get subFlowsByName() {
    return this._subFlowsByName;
  }

  override get typeName(): string {
    if (this.isFunction) {
      return "Function";
    }

    return String(this.flowLevel);
  }

  get name(): string | null {
    return this.identifier?.name || null;
  }

  /** The name the binary program's symbol of this flow has
   *  (docs/engine/binary-program.md, section 2): a scene's name, a branch's
   *  scene and its own name joined by a dot, and the empty string for the
   *  story's top-level content; nothing for a function, whose symbol the
   *  chunk store gives it. */
  public override get programSymbolName(): string | null {
    if (this.isFunction) {
      return null;
    }
    const names: string[] = [];
    let at: ParsedObject | null = this;
    while (at?.parent) {
      if (at instanceof FlowBase) {
        if (at.isFunction) {
          return null;
        }
        names.unshift(at.identifier?.name ?? "");
      }
      at = at.parent;
    }
    return names.join(".");
  }

  /** A function a statement's objects hold is one the story left in the
   *  block it is written in, whose container runs there as the block's
   *  content (a function the story takes out is a flow of the program, and
   *  one a statement creates as a value is not among its objects). */
  public override EmitProgram(emitter: ProgramEmitter): void {
    if (!this.isFunction) {
      emitter.unsupported(this.typeName);
    }
    emitter.emitFunctionInPlace(this);
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

    this._subFlowsByName = this.subFlowTable();

    for (const obj of contentObjs) {
      const subFlow = asOrNull(obj, FlowBase);
      if (subFlow) {
        if (this._firstChildFlow === null) {
          this._firstChildFlow = subFlow;
        }

        subFlowObjs.push(obj);
        // An included story's flows come first in the including story's
        // content, so an empty `weaveObjs` keeps the site the included
        // story recorded.
        if (weaveObjs.length > 0) {
          subFlow._definedAfter = weaveObjs[weaveObjs.length - 1]!;
        }
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
    // The flow's parameters answer too, and they are no table.
    recordRead(varName);
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

  // Whether `fromNode` reads the variable `varName` rather than whatever the
  // name means where no variable is in scope (a library such as `table`).
  // `ResolveVariableWithName` finds a `local` anywhere in its flow, and a
  // top-level `local` from every flow; this also requires the reference to
  // be in its scope, as `IsLocalInScopeAt` decides.
  public IsLocalInScope = (
    varName: string,
    fromNode: ParsedObject,
  ): boolean => {
    recordRead(varName);
    const storyDecl = this.story.variableDeclarations.get(varName);
    if (storyDecl && !storyDecl.isNewTemporaryDeclaration) {
      return true;
    }
    const parent = fromNode.parent;
    return (
      parent !== null &&
      this.IsLocalInScopeAt(varName, parent, parent.content.indexOf(fromNode))
    );
  };

  // Whether a `local` named `varName` is in scope just before
  // `parent.content[end]`. It is when it is declared in or under an earlier
  // object of that content, or of an ancestor's content up to the enclosing
  // flow, outside any block that closes first (see `declaresLocal`). Past
  // the enclosing flow, a parameter is in scope throughout it, and any other
  // name, a captured one included, is in scope in the flow when it is in
  // scope where the flow is written: at its place in the content that holds
  // it when that is not a flow's (a function written inside an `if` arm or a
  // loop body), at its function value when the lowering names the flow
  // itself (see `functionValueSite`), otherwise at its place in its parent
  // flow (see `definitionSite`), continuing outwards to the story.
  private IsLocalInScopeAt = (
    varName: string,
    parent: ParsedObject,
    end: number,
  ): boolean => {
    let node: ParsedObject | null = parent;
    while (node && !(node instanceof FlowBase)) {
      if (declaresLocal(node.content, end, varName)) {
        return true;
      }
      const child: ParsedObject = node;
      node = node.parent;
      end = node ? node.content.indexOf(child) : -1;
    }

    const flow = node as FlowBase | null;
    if (!flow || flow === this.story) {
      return false;
    }
    const arg = flow.args?.find((a) => a.identifier?.name === varName);
    if (arg && !arg.isUpvalue) {
      return true;
    }
    if (!arg && !this.story.variableDeclarations.has(varName)) {
      return false;
    }
    const parentFlow = asOrNull(flow.parent, FlowBase);
    // Where the flow is written depends on statements other than the one
    // resolving, which a resolution of the program path cannot name.
    recordRead("*");
    const site = !parentFlow
      ? flow.parent && {
          parent: flow.parent,
          end: flow.parent.content.indexOf(flow),
        }
      : flow.ownDebugMetadata || flow.identifier?.debugMetadata
        ? definitionSite(parentFlow, flow)
        : functionValueSite(this.story, flow);
    return !site || this.IsLocalInScopeAt(varName, site.parent, site.end);
  };

  public AddNewVariableDeclaration = (varDecl: VariableAssignment): void => {
    const varName = varDecl.variableName;
    if (this.variableDeclarations.has(varName)) {
      const varab = this.variableDeclarations.get(varName)!;

      // Luau lets a `local` be declared again, in a nested block or in the
      // same one; the new binding shadows the old one from that point on.
      // The flow keeps one registry for all its blocks, so a second `local`
      // of the same name is not a collision: the first registration is
      // enough for name resolution, and which binding a reference reads is
      // decided at runtime by the BeginScope/EndScope commands around each
      // block.
      if (varab.isNewTemporaryDeclaration && varDecl.isNewTemporaryDeclaration) {
        return;
      }

      // Same-name defines of DIFFERENT engine types coexist — e.g.
      // `define raffles as character` + `define raffles as synth`. They
      // register as type-namespaced structs (context.character.raffles /
      // context.synth.raffles, picked up via FindAll(StructDefinition)),
      // not a single flat global, so this isn't a real collision. (Two
      // defines of the SAME type, or a define vs a plain var, still error.)
      // A ROOT define (`define image with …`) declares the type named after
      // itself and carries no `structDefinition` (only typed `as T` defines
      // do), so fall back to its own name as its type identity. This lets a
      // builtin type (`image`) coexist with a same-named instance of another
      // type (`style.image`, the style for image elements): the type keeps the
      // flat global and the instance namespaces as `$style_image`.
      const newType =
        varDecl.structDefinition?.type?.name ??
        (varDecl.isDefineDeclaration ? varDecl.variableName : undefined);
      const existingType =
        varab.structDefinition?.type?.name ??
        (varab.isDefineDeclaration ? varab.variableName : undefined);
      if (
        varDecl.isDefineDeclaration &&
        varab.isDefineDeclaration &&
        newType &&
        existingType &&
        newType !== existingType
      ) {
        // The first define keeps the flat global slot (`raffles`); the
        // second registers as a type-namespaced singleton instead of
        // fighting for it — matching how `context` namespaces them
        // (context.character.raffles / context.synth.raffles). Its runtime
        // table is stored under a synthetic global key, but `__def(table,
        // "raffles", "synth")` still registers it into the `synth` type
        // table, so `synth.raffles` resolves. Critically it stays in
        // `variableDeclarations`, so its `__def` expression IS generated
        // (its `-> __def` divert gets a runtimeDivert) and ResolveReferences
        // doesn't throw and abort the pass. The `$type_name` key can't
        // collide with a script identifier (`$` is not legal in one).
        const qualifiedKey = `$${newType}_${varName}`;
        if (!this.variableDeclarations.has(qualifiedKey)) {
          this.variableDeclarations.set(qualifiedKey, varDecl);
        }
        return;
      }

      // A project OVERRIDING a builtin: the incumbent came from the
      // source-injected builtins prelude, the newcomer from a user file. The
      // prelude is injected first purely so its declarations exist to be
      // overridden, so first-writer-wins is exactly backwards here — it made
      // every `define slate_80 as color` / `define ui as config` a compile
      // error instead of a re-theme. Hand the slot to the authored declaration.
      //
      // The incumbent must NOT be dropped from `variableDeclarations`: its
      // parsed nodes stay in the prelude's content, and ResolveReferences
      // walks them regardless — a declaration missing from the registry never
      // generates its runtime, so its `__def` divert's `runtimeDivert` getter
      // throws and ABORTS the resolve pass for the whole story (everything
      // after the prelude is left unresolved; a project with any choice then
      // fails serialization on a null `pathOnChoice`, with zero diagnostics).
      // Same hazard the `$type_name` branch above documents. So the incumbent
      // re-registers under a synthetic `$prelude_` key (`$` can't appear in a
      // script identifier, and the `$type_name` convention is reserved for
      // dual-TYPE names) immediately BEFORE the authored declaration: the
      // prelude's `__def` runs first and the authored one re-registers over
      // it in place — the documented override semantic. The override pass has
      // also already back-filled the authored `__def` table with every prelude
      // value the author didn't restate (see
      // SparkdownCompiler.applyBuiltinOverrides), so a partial override keeps
      // the builtin's other fields. Two colliding AUTHORED defines still
      // error below. Narrow on purpose: only another DEFINE may take a
      // builtin's slot. A property declaration that happens to collide is not
      // an override and must fall through to the checks below.
      if (
        varab.isPreludeDeclaration &&
        !varDecl.isPreludeDeclaration &&
        varDecl.isDefineDeclaration
      ) {
        this.variableDeclarations.delete(varName);
        // A declaration-only marker of an unseeded compile
        // (Story.DeclareBuiltinGlobals) has no parsed node and nothing to
        // generate, so it is simply dropped rather than re-registered.
        const incumbentIsMarker =
          !varab.expression &&
          !varab.structDefinition &&
          !varab.listDefinition;
        if (!incumbentIsMarker) {
          const shadowKey = `$prelude_${varName}`;
          if (!this.variableDeclarations.has(shadowKey)) {
            this.variableDeclarations.set(shadowKey, varab);
          }
        }
        this.variableDeclarations.set(varName, varDecl);
        return;
      }

      // A collision with a constant is already reported — with real source
      // provenance — by `Story.CheckForNamingCollisions`, which the colliding
      // declaration runs during ResolveReferences. The synthetic declaration
      // minted per constant by `Story.RegisterConstantGlobals` carries no
      // debugMetadata, so reporting here too would only add an
      // indistinguishable duplicate pointing at a null location.
      if (varab.isConstantDeclaration && !varDecl.isConstantDeclaration) {
        varDecl.RefuseAsDuplicate();
        return;
      }

      if (!varDecl.isPropertyDeclaration) {
        this.Error(
          `Duplicate identifier \`${varName}\`. A ${varab.typeName.toLowerCase()} named \`${varName}\` already exists on ${
            varab.debugMetadata
          }`,
          varDecl.identifier!.debugMetadata,
        );
      }

      varDecl.RefuseAsDuplicate();
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
    let foundReturn: ReturnType | MultiReturnType | null = null;
    // A scene also contains its branches, and a weave can hold function
    // definitions. Each flow validates its own returns, rather than taking
    // a return from a child flow and reporting it as the parent's mistake.
    const belongsToThisFlow = (returned: ParsedObject): boolean => {
      for (let parent = returned.parent; parent; parent = parent.parent) {
        if (parent instanceof FlowBase) return parent === this;
      }
      return false;
    };
    if (this.isFunction) {
      this.CheckForDisallowedFunctionFlowControl();
    } else if (
      this.flowLevel === FlowLevel.Knot ||
      this.flowLevel === FlowLevel.Stitch
    ) {
      // Scenes and branches cannot return function values.
      foundReturn = this.Find(ReturnType)(belongsToThisFlow) ?? this.Find(MultiReturnType)(belongsToThisFlow);

      if (foundReturn !== null) {
        this.ReportReturnOutsideFunction(foundReturn);
      }
    } else if (this.flowLevel === FlowLevel.Story) {
      // Explicit Luau return nodes are only valid inside a function body:
      // their PopFunction needs an active function-call frame. Bare return
      // lines in narrative scope are ordinary prose and produce no return
      // node; misplaced marked returns are validated at runtime export.
      //
      // `_rootWeave` holds the Story's free-floating top-level content
      // (everything outside a `scene` / `branch` / `function`). Inkjs's
      // Search the weave, with the same ownership predicate as child
      // flows, so returns belonging to functions remain valid.
      if (this._rootWeave !== null) {
        const rootReturn = this._rootWeave.Find(ReturnType)(belongsToThisFlow) ?? this._rootWeave.Find(MultiReturnType)(belongsToThisFlow);
        if (rootReturn !== null) {
          this.ReportReturnOutsideFunction(rootReturn);
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
      const obj: ParsedObject = this.content[contentIdx]!;

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
          this.ReportDuplicateChildFlow(
            childFlow,
            (existingChild as any as RuntimeObject).debugMetadata,
          );
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

  /** Reports a return written in a scene, a branch or at file scope, which
   *  only a function body can hold. Generation reports the first such return
   *  of the flow (`GenerateRuntimeObject`), and the program path's resolver
   *  the first one its statements recorded. */
  public ReportReturnOutsideFunction(foundReturn: ParsedObject): void {
    if (this.flowLevel === FlowLevel.Story) {
      this.Error(
        `Return statements can only be used inside a function body — found one at file scope.`,
        foundReturn,
      );
      return;
    }
    this.Error(
      `Return statements can only be used inside a function body — found one in ${this.flowLevel === FlowLevel.Knot ? "scene" : "branch"} '${this.identifier}'.`,
      foundReturn,
    );
  }

  /** Reports a flow written under this one with the name of one before it,
   *  whose position `existing` is. */
  public ReportDuplicateChildFlow(
    childFlow: FlowBase,
    existing: DebugMetadata | null,
  ): void {
    const name = childFlow.identifier?.name as string;
    const errorMsg = `Duplicate identifier \`${name}\`. ${this.GetType()} already contains flow named \`${name}\` on ${existing}`;
    this.Error(errorMsg, childFlow?.identifier || childFlow);
  }

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
      const paramName = arg!.identifier?.name || null;
      const assign = new RuntimeVariableAssignment(
        paramName,
        true,
        !!arg!.isVararg,
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
    // The flow's own name answers too, and it is no table.
    recordRead(name);

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

  public override ResolveWith(context: any, program: boolean): void {
    if (this._startingSubFlowDivert) {
      if (!this._startingSubFlowRuntime) {
        throw new Error();
      }

      if (!program) {
        this._startingSubFlowDivert.targetPath =
          this._startingSubFlowRuntime.path;
      }
    }

    super.ResolveWith(context, program);

    this.CheckOwnNames(context);
  }

  /** What a flow's resolution checks of its own names once its content is
   *  resolved: its parameters' names, and its own name against the story's
   *  other names. The program path's resolver makes these checks for a scene
   *  or a branch whose statements it resolves one by one. */
  public CheckOwnNames(context: any): void {
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
      // so have to be checked independently. The bare `_` is Luau's name for
      // an unused parameter and may repeat (`function(_, _, value)`); any
      // other name, one starting with `_` included, may not.
      for (let ii = 0; ii < this.args.length; ii += 1) {
        for (let jj = ii + 1; jj < this.args.length; jj += 1) {
          const name = this.args[ii]!.identifier?.name;
          if (name !== "_" && name == this.args[jj]!.identifier?.name) {
            this.Error(
              `Multiple arguments with the same name: \`${this.args[ii]!.identifier}\``,
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

  public override readonly toString = (): string =>
    `${this.typeName} \`${this.identifier}\``;
}
