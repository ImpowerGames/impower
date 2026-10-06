import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { DebugMetadata } from "../../../../engine/DebugMetadata";
import { Divert as RuntimeDivert } from "../../../../engine/Divert";
import { Path as RuntimePath } from "../../../../engine/Path";
import { PushPopType } from "../../../../engine/PushPop";
import { asOrNull } from "../../../../engine/TypeAssertion";
import { NullValue, VariablePointerValue } from "../../../../engine/Value";
import { Argument } from "../Argument";
import { Expression } from "../Expression/Expression";
import { ClosestFlowBase } from "../Flow/ClosestFlowBase";
import { FlowBase } from "../Flow/FlowBase";
import { FunctionCall } from "../FunctionCall";
import { Identifier } from "../Identifier";
import { currentCompileEpoch } from "../CompileEpoch";
import { ParsedObject } from "../Object";
import { Path } from "../Path";
import { Story } from "../Story";
import { VariableReference } from "../Variable/VariableReference";
import { DivertTarget } from "./DivertTarget";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import {
  CALL_TUNNEL,
  LEAVE_CONTINUE,
  Op,
} from "../../../../../program/ProgramInstructions";
import {
  isLoopInternal,
  loopExitOf,
} from "../../../../../compiler/lower/utils/statementShape";

export class Divert extends ParsedObject {
  public readonly args: Expression[] = [];

  public readonly pathIdentifiers: Identifier[] | null = null;
  public readonly target: Path | null = null;

  // Cross-node cache of the resolved target PARSED node, epoch-guarded: a
  // reused (not regenerated) divert would otherwise keep pointing at a STALE
  // node when its target flow was rebuilt or deleted — validating arity
  // against the old signature and skipping "target not found". A stale epoch
  // reads as `null`, which makes `ResolveTargetContent`'s short-circuit
  // re-resolve once per compile. Within one compile the behavior is
  // unchanged (generation and resolve share the epoch).
  private _targetContent: ParsedObject | null = null;
  private _targetContentEpoch: number = -1;
  // Epoch of the last `runtimeDivert.variableDivertName` assignment (variable
  // targets and the unresolved-call promotion below). A reused divert keeps
  // its runtime object across compiles, so a stale variable-divert must be
  // cleared and re-derived — otherwise `-> foo` promoted while `foo` was
  // missing would never resolve back to the knot once `foo` exists again.
  private _variableDivertEpoch: number = -1;
  get targetContent(): ParsedObject | null {
    return this._targetContentEpoch === currentCompileEpoch()
      ? this._targetContent
      : null;
  }
  set targetContent(value: ParsedObject | null) {
    this._targetContent = value;
    this._targetContentEpoch = value === null ? -1 : currentCompileEpoch();
  }

  private _runtimeDivert: RuntimeDivert | null = null;
  get runtimeDivert(): RuntimeDivert {
    if (!this._runtimeDivert) {
      throw new Error();
    }

    return this._runtimeDivert;
  }

  set runtimeDivert(value: RuntimeDivert) {
    this._runtimeDivert = value;
  }

  public isFunctionCall: boolean = false;
  public isEmpty: boolean = false;
  public isTunnel: boolean = false;
  public isThread: boolean = false;

  get isEnd(): boolean {
    return Boolean(this.target && this.target.dotSeparatedComponents === "END");
  }

  get isDone(): boolean {
    return Boolean(
      this.target && this.target.dotSeparatedComponents === "DONE",
    );
  }

  constructor(
    pathIdentifiers?: Identifier[] | null | undefined,
    args?: Expression[],
  ) {
    super();

    if (pathIdentifiers) {
      this.pathIdentifiers = pathIdentifiers;
      const target = new Path(pathIdentifiers);
      this.target = target;
    }

    if (args) {
      this.args = args;
      this.AddContent(args);
    }
  }

  override get typeName(): string {
    return "Divert";
  }

  // The two built-in targets are instructions of their own, as they are
  // control commands of the runtime tree. A `break` or `continue`, which the
  // lowering writes as a divert to a label of its loop, leaves the blocks up
  // to the loop's body. Any other divert is a jump to its target's symbol, or
  // to the symbol value a variable holds (`JumpSym`, `JumpVar`); a tunnel
  // calls its target (`Call`, `CallVar` with the tunnel flag); and a thread
  // forks around its jump, the original resuming after it when the fork
  // ends (docs/engine/binary-program.md, section 3).
  public override EmitProgram(emitter: ProgramEmitter): void {
    const exit = loopExitOf.get(this);
    if (this.isEnd) {
      emitter.emit(Op.End);
      return;
    }
    if (this.isDone) {
      emitter.emit(Op.Done);
      return;
    }
    if (exit) {
      emitter.emit(Op.Leave, 0, 0, exit === "continue" ? LEAVE_CONTINUE : 0);
      return;
    }
    if (this._runtimeDivert?.isExternal) {
      emitter.unsupported("external");
    }
    if (this.args.length > 0) {
      // A flow's parameters are not bound yet (`Argument`).
      emitter.unsupported("Argument");
    }
    const thread = this.isThread ? emitter.jump(Op.Thread) : null;
    this.EmitJump(emitter, this.isTunnel ? CALL_TUNNEL : -1);
    if (thread) {
      emitter.bind(thread);
    }
  }

  /** The jump of a divert to its target, or with `tunnelFlags` set, the call
   *  of its target as a tunnel. The chunk records the jump's resolution
   *  (`programJumpKey`), and refers to the target's symbol by no fact about
   *  it: a jump's code is the same whatever the program defines the symbol
   *  as, or whether it defines it at all, so the chunk is kept while the
   *  target disappears and comes back (section 2, A symbol that
   *  disappears). */
  public EmitJump(emitter: ProgramEmitter, tunnelFlags = -1): void {
    const key = this.programJumpKey;
    if (key !== null) {
      emitter.recordResolution(key);
    }
    const variable = this._runtimeDivert?.variableDivertName;
    if (variable != null) {
      if (tunnelFlags >= 0) {
        emitter.emit(Op.CallVar, emitter.string(variable), 0, tunnelFlags);
      } else {
        emitter.emit(Op.JumpVar, emitter.string(variable));
      }
      return;
    }
    const target = this.targetContent;
    if (target instanceof FlowBase && target.isFunction) {
      emitter.unsupported(this.typeName);
    }
    const symbol = emitter.targetSymbol(target, this.writtenTargetName);
    emitter.referenceTarget(symbol);
    if (tunnelFlags >= 0) {
      emitter.emit(Op.Call, symbol, 0, tunnelFlags);
    } else {
      emitter.emit(Op.JumpSym, symbol);
    }
  }

  /** The target as the divert writes it, dots joining its parts. */
  get writtenTargetName(): string {
    return this.target?.dotSeparatedComponents ?? "";
  }

  /** How the divert's target resolved, as the chunk of its statement records
   *  it: the symbol its jump names, which is the qualified name of the
   *  target it found or, for a target it found none of, the name as written,
   *  or the variable whose value it jumps to. A divert the program does not
   *  emit as a jump has none: a call, `done`, `fin`, a loop's own diverts,
   *  and a function held as a value, whose symbol the chunk records apart. */
  get programJumpKey(): string | null {
    if (
      this.isFunctionCall ||
      this.isEnd ||
      this.isDone ||
      loopExitOf.has(this) ||
      isLoopInternal(this)
    ) {
      return null;
    }
    const variable = this._runtimeDivert?.variableDivertName;
    if (variable != null) {
      return `jump:${variable}:variable`;
    }
    const target = this.targetContent;
    if (target instanceof FlowBase && target.isFunction) {
      return null;
    }
    return `jump:${target?.programSymbolName ?? this.writtenTargetName}`;
  }

  /** A function call's code: its arguments, then the call. A function the
   *  compile found is called by its symbol (`Call`), with a pointer for each
   *  argument it takes by reference, as `GenerateRuntimeObject` pushes them.
   *  A name that is no function the compile found is read as a variable
   *  when the call runs (`CallVar`), whatever it holds then. Both carry the
   *  number of arguments written, and the call arranges those arguments for
   *  the function it enters: its parameters, the surplus dropped and the
   *  missing nil, or for a variadic function its fixed parameters with the
   *  rest packed into the one value its `...` binds. */
  public EmitCall(emitter: ProgramEmitter): void {
    const target = this.targetContent;
    const variable = this._runtimeDivert?.variableDivertName;
    if (this._runtimeDivert?.isExternal) {
      emitter.unsupported("external");
    }
    emitter.recordResolution(this.callResolutionKey);
    if (variable != null) {
      for (const arg of this.args) {
        emitter.emitObject(arg);
      }
      emitter.emit(Op.CallVar, emitter.string(variable), this.args.length);
      return;
    }
    const flow = asOrNull(target, FlowBase);
    if (!flow || !flow.isFunction) {
      emitter.unsupported(this.typeName);
    }
    const params = flow.args ?? [];
    this.args.forEach((arg, i) => {
      const param = i < params.length ? params[i]! : null;
      if (param?.isByReference && !param.isVararg) {
        const name = asOrNull(arg, VariableReference)?.name;
        if (name == null) {
          emitter.unsupported("a by-reference argument that is no variable");
        }
        emitter.emit(Op.VarPtr, emitter.variable(name));
      } else {
        emitter.emitObject(arg);
      }
    });
    const symbol = emitter.functionSymbol(flow);
    emitter.reference(symbol);
    emitter.emit(Op.Call, symbol, this.args.length);
  }

  /** How a function call's target resolved, as the chunk of its statement
   *  records it: a variable read when the call runs, or a function and the
   *  kind of each of its parameters (the call passes a by-reference one a
   *  pointer at its argument). */
  get callResolutionKey(): string {
    const name = this.target?.dotSeparatedComponents ?? "";
    const variable = this._runtimeDivert?.variableDivertName;
    if (variable != null) {
      return `call:${variable}:variable`;
    }
    const flow = asOrNull(this.targetContent, FlowBase);
    if (!flow) {
      return `call:${name}:none`;
    }
    const params = (flow.args ?? [])
      .map((p) => (p.isByReference ? "ref" : p.isVararg ? "..." : "value"))
      .join(",");
    return `call:${name}:${flow.isFunction ? "function" : "flow"}:${params}`;
  }

  public readonly GenerateRuntimeObject = () => {
    // End = end flow immediately
    // Done = return from thread or instruct the flow that it's safe to exit
    if (this.isEnd) {
      return RuntimeControlCommand.End();
    } else if (this.isDone) {
      return RuntimeControlCommand.Done();
    }

    this.runtimeDivert = new RuntimeDivert();

    // Normally we resolve the target content during the
    // Resolve phase, since we expect all runtime objects to
    // be available in order to find the final runtime path for
    // the destination. However, we need to resolve the target
    // (albeit without the runtime target) early so that
    // we can get information about the arguments - whether
    // they're by reference - since it affects the code we
    // generate here.
    this.ResolveTargetContent();

    this.CheckArgumentValidity();

    // Passing arguments to the knot. A function call arranges its
    // arguments for the function it enters when it runs, whichever
    // function that is, as Luau does (`callArgCount`, the number the call
    // site pushes): the surplus dropped and the missing nil, or a variadic
    // function's extras packed for its `...`. A divert, tunnel or thread
    // to a variadic flow packs them here: even with zero args, it needs a
    // `PackTuple(0)` emitted so the flow's entry binding still pops a
    // (empty) `MultiValue` into the `__varargs__` slot.
    let targetArgumentsPreview: Argument[] | null = null;
    if (this.targetContent) {
      targetArgumentsPreview = (this.targetContent as FlowBase).args;
    }
    const targetIsVariadicPreview =
      !!targetArgumentsPreview &&
      targetArgumentsPreview.length > 0 &&
      !!targetArgumentsPreview[targetArgumentsPreview.length - 1]!.isVararg;
    const packsArguments = targetIsVariadicPreview && !this.isFunctionCall;
    if (this.isFunctionCall) {
      this.runtimeDivert.callArgCount = this.args.length;
    }
    const requiresArgCodeGen =
      (this.args !== null && this.args.length > 0) || packsArguments;
    if (
      requiresArgCodeGen ||
      this.isFunctionCall ||
      this.isTunnel ||
      this.isThread
    ) {
      const container = new RuntimeContainer();

      // Generate code for argument evaluation
      // This argument generation is coded defensively - it should
      // attempt to generate the code for all the parameters, even if
      // they don't match the expected arguments. This is so that the
      // parameter objects themselves are generated correctly and don't
      // get into a state of attempting to resolve references etc
      // without being generated.
      if (requiresArgCodeGen) {
        // Function calls already in an evaluation context
        if (!this.isFunctionCall) {
          container.AddContent(RuntimeControlCommand.EvalStart());
        }

        const targetArguments: Argument[] | null = targetArgumentsPreview;

        // Variadic target detection: if the target's last formal arg
        // is marked `isVararg`, a divert that is no function call packs
        // the surplus args into a single `MultiValue` via
        // `PackTuple(extra)` after they've all been pushed. The flow's
        // entry then binds N+1 params normally — regular args plus one
        // `__varargs__` slot receiving the packed MultiValue. Surplus is
        // computed as `args.length - regular_arity` (clamped to 0+). The
        // divert may supply fewer args than the regular arity, in which
        // case the vararg slot gets `PackTuple(0)` → empty `MultiValue`.
        const targetIsVariadic =
          !!targetArguments &&
          targetArguments.length > 0 &&
          !!targetArguments[targetArguments.length - 1]!.isVararg;
        const regularArity = targetIsVariadic
          ? targetArguments!.length - 1
          : targetArguments?.length ?? this.args.length;

        const argsToPush = this.args.slice();
        // For variadic targets, missing regular params become nil
        // (Lua semantics). Mark each missing slot with a NullExpression
        // sentinel that pushes `NullValue` at runtime. Non-variadic
        // targets still hit `CheckArgumentValidity`'s strict check.
        const nullPadding = Math.max(0, regularArity - argsToPush.length);

        // How many args are pushed: a by-reference error below stops the
        // pushes, and a function call arranges the args it pushed.
        let pushed = 0;
        for (let ii = 0; ii < argsToPush.length; ++ii) {
          const argToPass: Expression = argsToPush[ii]!;
          let argExpected: Argument | null = null;
          if (targetArguments && ii < targetArguments.length) {
            argExpected = targetArguments[ii]!;
          } else if (targetIsVariadic) {
            // Surplus arg lands in the vararg slot — same Argument
            // shape as the formal `...`. Doesn't change codegen, just
            // suppresses by-reference/divert-target checks.
            argExpected = null;
          }

          // Pass by reference: argument needs to be a variable reference
          if (argExpected && argExpected.isByReference) {
            const varRef = asOrNull(argToPass, VariableReference);
            if (!varRef) {
              this.Error(
                `Expected variable name to pass by reference to 'ref ${argExpected.identifier}' but saw ${argToPass}`,
              );

              break;
            }

            // Check that we're not attempting to pass a read count by reference
            const targetPath = new Path(varRef.pathIdentifiers);
            const targetForCount: ParsedObject | null =
              targetPath.ResolveFromContext(this);
            if (targetForCount) {
              this.Error(
                `can't pass a read count by reference. \`${
                  targetPath.dotSeparatedComponents
                }\` is a knot/stitch/label, but \`${
                  this.target!.dotSeparatedComponents
                }\` requires the name of a variable to be passed.`,
              );

              break;
            }

            const varPointer = new VariablePointerValue(varRef.name);
            container.AddContent(varPointer);
          } else {
            // Normal value being passed: evaluate it as normal
            argToPass.GenerateIntoContainer(container);
          }
          pushed += 1;
        }

        if (this.isFunctionCall) {
          this.runtimeDivert.callArgCount = pushed;
        } else if (targetIsVariadic) {
          // Push `NullValue` for any regular params the caller
          // under-supplied. They land BETWEEN the regular pushed
          // args and the soon-to-be-packed vararg slot; the
          // function-entry binding pops them in reverse order.
          for (let p = 0; p < nullPadding; p++) {
            container.AddContent(new NullValue());
          }
          const extraCount = Math.max(0, argsToPush.length - regularArity);
          container.AddContent(
            RuntimeControlCommand.PackTuple(extraCount),
          );
        }

        // Function calls were already in an evaluation context
        if (!this.isFunctionCall) {
          container.AddContent(RuntimeControlCommand.EvalEnd());
        }
      }

      // Starting a thread? A bit like a push to the call stack below... but not.
      // It sort of puts the call stack on a thread stack (argh!) - forks the full flow.
      if (this.isThread) {
        container.AddContent(RuntimeControlCommand.StartThread());
      } else if (this.isFunctionCall || this.isTunnel) {
        // If this divert is a function call, tunnel, we push to the call stack
        // so we can return again
        this.runtimeDivert.pushesToStack = true;
        this.runtimeDivert.stackPushType = this.isFunctionCall
          ? PushPopType.Function
          : PushPopType.Tunnel;
      }

      // Jump into the "function" (knot/stitch)
      container.AddContent(this.runtimeDivert);

      return container;
    }

    // Simple divert
    return this.runtimeDivert;
  };

  // When the divert is to a target that's actually a variable name
  // rather than an explicit knot/stitch name, try interpretting it
  // as such by getting the variable name.
  public readonly PathAsVariableName = () =>
    this.target ? this.target.firstComponent : null;

  // Whether the author binds `name` somewhere the divert can read it: an
  // assignment to the global anywhere in the story (`& game = -> there`,
  // whichever flow or callable holds it, since a global write is visible
  // everywhere; `Story.globalAssignmentNames` leaves out a write to a
  // parameter or local of that name), or a parameter or local
  // (`variableDeclarations`) of the flow this divert belongs to: the
  // divert's own flow and the flows enclosing it up to the nearest callable
  // or the top-level flow, plus the branches of that top. A story-level
  // divert has no such flow and only the global assignments apply to it.
  //
  // This decides only the severity of the report, never its absence. Whether
  // such a binding holds a divert target when the divert runs depends on the
  // path taken: a parameter is bound at the flow's head and not when the
  // flow is entered at a label, a local is set only if its statement ran and
  // in the call-stack element it ran in, a tunnel pushes a fresh element,
  // and a global assignment binds only once it has run. None of that is
  // modelled, and the assigned value is not inspected; a binding makes the
  // report a warning that names the condition, and none makes it an error.
  // Callables are a boundary for locals in both directions: a callable
  // written in a scene is hoisted to the top level, so its body is never
  // inside the scene's flow, and a callable's divert-target literals are not
  // captured as upvalues, so the same holds for one nested in another
  // callable. Neither this walk nor the index treats a loop body specially;
  // they see whatever statements the flow holds. A `while` or `for` body
  // written in a scene currently contributes none (#470), so nothing
  // declared or assigned there is seen and the report stays an error.
  private hasAuthoredBinding(name: string, story: Story): boolean {
    if (story.globalAssignmentNames().has(name)) {
      return true;
    }
    const own = asOrNull(ClosestFlowBase(this), FlowBase);
    if (!own || own === own.story) {
      return false;
    }
    const declares = (candidate: FlowBase): boolean =>
      (candidate.args?.some((arg) => arg.identifier?.name === name) ??
        false) || candidate.variableDeclarations.has(name);
    // Up from the own flow to the nearest callable or the top-level flow.
    let top: FlowBase = own;
    let flow: FlowBase | null = own;
    while (flow && flow !== flow.story) {
      if (declares(flow)) {
        return true;
      }
      top = flow;
      if (flow.isFunction) {
        break;
      }
      flow = asOrNull(ClosestFlowBase(flow), FlowBase);
    }
    if (top.isFunction) {
      return false;
    }
    // Down through the top's branches (not its callables).
    const branchDeclares = (candidate: FlowBase): boolean => {
      for (const child of candidate.content ?? []) {
        if (
          child instanceof FlowBase &&
          !child.isFunction &&
          (declares(child) || branchDeclares(child))
        ) {
          return true;
        }
      }
      return false;
    };
    return branchDeclares(top);
  }

  // A bare `name = …` makes `name` a global only as its assignment resolves
  // (`VariableAssignment.ResolveReferences`), after every divert generated in
  // the compile has found its target. A divert whose runtime object a reused
  // flow carries finds its target again after that, and gives way to a flow
  // of the name as a divert generated in the compile does: a function of the
  // name is called rather than the global.
  private autoGlobalGivesWay(name: string, isGlobal: boolean): boolean {
    if (!isGlobal) {
      return false;
    }
    const declaration = this.story.variableDeclarations.get(name);
    return (
      declaration !== undefined &&
      !declaration.isDeclaration &&
      this.target?.ResolveFromContext(this) != null
    );
  }

  // Whether this is a call of a function written at the top level whose name
  // a plain assignment anywhere in the story writes to the global scope
  // (`Story.globalAssignmentNames`). A function nested in another is a value
  // of that function's scope, which its lowering rebinds itself.
  private callsReboundFunction(story: Story): boolean {
    const name = this.target?.firstComponent;
    if (
      !this.isFunctionCall ||
      this.runtimeDivert.variableDivertName != null ||
      this.target?.numberOfComponents !== 1 ||
      !name
    ) {
      return false;
    }
    const flow = asOrNull(this.targetContent, FlowBase);
    return (
      !!flow &&
      flow.isFunction &&
      ClosestFlowBase(flow) === story &&
      story.globalAssignmentNames().has(name)
    );
  }

  public readonly ResolveTargetContent = (): void => {
    if (this.isEmpty || this.isEnd) {
      return;
    }

    if (this.targetContent === null) {
      // Is target of this divert a variable name that will be de-referenced
      // at runtime? If so, there won't be any further reference resolution
      // we can do at this point.
      let variableTargetName = this.PathAsVariableName();
      if (variableTargetName !== null) {
        const flowBaseScope = asOrNull(ClosestFlowBase(this), FlowBase);
        if (flowBaseScope) {
          const resolveResult = flowBaseScope.ResolveVariableWithName(
            variableTargetName,
            this,
          );

          if (
            resolveResult.found &&
            !this.autoGlobalGivesWay(variableTargetName, resolveResult.isGlobal)
          ) {
            // A parameter needs no divert-target marking to be diverted to:
            // parameters are untyped, and `name: ->` is only an annotation.
            this.runtimeDivert.variableDivertName = variableTargetName;
            this._variableDivertEpoch = currentCompileEpoch();
            return;
          }
        }
      }

      if (!this.target) {
        throw new Error();
      }

      this.targetContent = this.target.ResolveFromContext(this);
    }
  };

  public override ResolveReferences(context: Story): void {
    if (this.isEmpty || this.isEnd || this.isDone) {
      return;
    } else if (!this.runtimeDivert) {
      throw new Error();
    }

    // A variable-divert derived in a PREVIOUS compile (reused runtime object)
    // must be re-derived against the current tree — see
    // `_variableDivertEpoch`. Clearing it re-opens both retry paths below.
    if (
      this.runtimeDivert.variableDivertName != null &&
      this._variableDivertEpoch !== currentCompileEpoch()
    ) {
      this.runtimeDivert.variableDivertName = null;
    }

    // Retry variable-target resolution. `ResolveTargetContent` ran
    // early during `GenerateRuntimeObject` so the runtime tree could
    // be built; at that point Luau auto-globals (`Y = function...`)
    // hadn't yet been registered in `story.variableDeclarations`
    // (registration happens during `VariableAssignment.ResolveReferences`,
    // a later phase). Re-running here lets the divert pick up
    // auto-globals registered between the two phases. Cheap idempotent
    // re-run — already-resolved targets short-circuit inside
    // `ResolveTargetContent`.
    if (
      this.targetContent === null &&
      this.runtimeDivert.variableDivertName == null
    ) {
      this.ResolveTargetContent();
    }

    // A call of a top-level function whose name the story also assigns as a
    // global calls what the global holds when the call runs: Luau's
    // `function f` is `f = function`, so `f = g` anywhere rebinds `f`. Until
    // an assignment runs the global is unset, and a call through it reaches
    // the function of its name (`callVariableTarget`). A story that never
    // assigns the name keeps the direct call.
    if (this.callsReboundFunction(context)) {
      this.runtimeDivert.variableDivertName = this.target!.firstComponent;
      this._variableDivertEpoch = currentCompileEpoch();
    }

    if (this.runtimeDivert.variableDivertName != null) {
      // A reused runtime divert may still hold the path it resolved in a
      // previous compile; a cold compile gives a variable divert none.
      this.runtimeDivert.targetPath = null;
    } else if (this.targetContent) {
      this.runtimeDivert.targetPath = this.targetContent.runtimePath;
    } else {
      // Re-resolution found no target this compile. A REUSED runtime divert
      // may still hold the path it resolved in a previous compile (e.g. its
      // target flow was since deleted) — restore the fresh-generation state
      // so serialization and diagnostics match a cold compile. (Externals
      // re-derive their path in the external branch below.)
      this.runtimeDivert.targetPath = null;
    }

    // A divert bound to a builtin global's variable (`-> game`, whether the
    // slot holds the prelude's marker or an authored override) can never
    // reach a flow of that name and fails when run; the compiler reports each
    // one from `context.builtinGlobalDiverts`. Recorded here, once per compile
    // for reused diverts too. Not recorded: a Luau call (`game()` lowers to a
    // divert too, but names no scene, branch, or label). A divert whose name
    // the author binds, by a parameter or local of its enclosing flow or by
    // an assignment to the global anywhere, is recorded as uncertain
    // (`warning`): whether that binding holds a divert target when the
    // divert runs depends on the path taken (see `hasAuthoredBinding`).
    const capturedBy = this.runtimeDivert.variableDivertName;
    if (
      capturedBy != null &&
      !this.isFunctionCall &&
      context.builtinGlobalNames.has(capturedBy)
    ) {
      context.builtinGlobalDiverts.push({
        name: capturedBy,
        divert: this,
        warning: this.hasAuthoredBinding(capturedBy, context),
      });
    }

    // Resolve children (the arguments)
    super.ResolveReferences(context);

    // May be null if it's a built in function (e.g. TURNS_SINCE)
    // or if it's a variable target.
    let targetFlow = asOrNull(this.targetContent, FlowBase);
    if (targetFlow) {
      if (!targetFlow.isFunction && this.isFunctionCall) {
        super.Error(
          `${targetFlow.identifier} hasn't been marked as a function, but it's being called as one. Do you need to declare the knot as '== function ${targetFlow.identifier} =='?`,
        );
      } else if (
        targetFlow.isFunction &&
        !this.isFunctionCall &&
        !(this.parent instanceof DivertTarget)
      ) {
        super.Error(
          targetFlow.identifier +
            " can't be diverted to. It can only be called as a function since it's been marked as such: '" +
            targetFlow.identifier +
            "(...)'",
        );
      }
    }

    // Check validity of target content
    const targetWasFound = this.targetContent !== null;
    let isBuiltIn: boolean = false;
    let isExternal: boolean = false;

    // NOTE for incremental reuse: the external branch below is a one-way door
    // like the target paths above (it sets `isExternal`/`externalArgs` and
    // flips `pushesToStack` to false), but it deliberately gets NO reset here.
    // A correct reset would have to restore `pushesToStack` to its
    // GENERATION-time value (set true for calls/tunnels at
    // `GenerateRuntimeObject`), which resolution cannot recompute — and a
    // partial reset would half-decay the divert, which is worse than none.
    // Instead, adding, removing, renaming, or re-arity-ing an `EXTERNAL` is a
    // structural change that disables flow reuse for that compile (see the
    // root-region descriptor in `SparkdownCompiler.parseIncrementally`), so a
    // reused divert can never outlive its external declaration.

    if (!this.target) {
      throw new Error();
    } else if (this.target.numberOfComponents === 1) {
      if (!this.target.firstComponent) {
        throw new Error();
      }

      // BuiltIn means TURNS_SINCE, CHOICE_COUNT, RANDOM or SEED_RANDOM
      isBuiltIn = FunctionCall.IsBuiltIn(this.target.firstComponent);

      // Client-bound function?
      isExternal = context.IsExternal(this.target.firstComponent);

      if (isBuiltIn || isExternal) {
        // A scene or branch may share a builtin's name (`scene next`), and a
        // divert that found it goes there.
        if (!this.isFunctionCall && !targetWasFound) {
          // Placed on the target's name, like `target not found` below: the
          // divert itself may have no position but its scene's.
          super.Error(
            `${this.target.firstComponent} must be called as a function: ~ ${this.target.firstComponent}()`,
            this.pathIdentifiers
              ? new Identifier(...this.pathIdentifiers)
              : this,
          );
        }

        if (isExternal) {
          this.runtimeDivert.isExternal = true;
          if (this.args !== null) {
            this.runtimeDivert.externalArgs = this.args.length;
          }

          this.runtimeDivert.pushesToStack = false;
          this.runtimeDivert.targetPath = new RuntimePath(
            this.target.firstComponent,
          );

          this.CheckExternalArgumentValidity(context);
        }

        return;
      }
    }

    // Variable target?
    if (this.runtimeDivert.variableDivertName != null) {
      return;
    }

    if (!targetWasFound && !isBuiltIn && !isExternal) {
      // Luau-superset semantics: a bare `NAME(args)` call lowers to a
      // Divert(-> NAME) with `isFunctionCall = true`. If NAME doesn't
      // resolve to a knot at compile time, Luau allows the call to
      // proceed — the runtime resolves the global, and a missing one
      // fails at call time rather than compile time. Promote
      // single-component unresolved CALL targets to variable-target
      // diverts so the runtime variable-divert path takes over (it
      // handles closures, `__stdlib_fn` markers, `__call` metatables,
      // etc.).
      //
      // Ink-style standalone diverts (`-> nowhere`) keep the compile-
      // time error — those are explicit divert-to-knot syntax with no
      // Luau equivalent, and silently routing them to the runtime
      // would hide genuine typos in ink stories. The `isFunctionCall`
      // flag distinguishes the two: it's set when the call site was
      // `foo()` (or `func foo()` etc.), false when it was `-> foo`.
      // Multi-component paths also stay as errors — they look like
      // knot navigation that genuinely failed (`-> a.b.c`).
      if (
        this.isFunctionCall &&
        this.target.numberOfComponents === 1 &&
        this.target.firstComponent
      ) {
        this.runtimeDivert.variableDivertName = this.target.firstComponent;
        this._variableDivertEpoch = currentCompileEpoch();
        return;
      }
      this.Error(
        `target not found: \`${this.target}\``,
        this.pathIdentifiers ? new Identifier(...this.pathIdentifiers) : this,
      );
    }
  }

  // Returns false if there's an error
  public readonly CheckArgumentValidity = (): void => {
    if (this.isEmpty) {
      return;
    }

    // Argument passing: Check for errors in number of arguments
    let numArgs = 0;
    if (this.args !== null && this.args.length > 0) {
      numArgs = this.args.length;
    }

    // Missing content?
    // Can't check arguments properly. It'll be due to some
    // other error though, so although there's a problem and
    // we report false, we don't need to report a specific error.
    // It may also be because it's a valid call to an external
    // function, that we check at the resolve stage.
    if (this.targetContent === null) {
      return;
    }

    const targetFlow = asOrNull(this.targetContent, FlowBase);

    // No error, crikey!
    if (numArgs === 0 && (targetFlow === null || !targetFlow.hasParameters)) {
      return;
    } else if (targetFlow === null && numArgs > 0) {
      this.Error(
        "target needs to be a knot or stitch in order to pass arguments",
      );
      return;
    } else if (
      targetFlow !== null &&
      (targetFlow.args === null || (!targetFlow.args && numArgs > 0))
    ) {
      this.Error(`target (${targetFlow.name}) doesn't take parameters`);
      return;
    } else if (this.parent instanceof DivertTarget) {
      if (numArgs > 0) {
        this.Error(`can't store arguments in a divert target variable`);
      }

      return;
    }

    const paramCount = targetFlow!.args!.length;
    // Variadic target: `function f(a, b, ...)` — the trailing
    // `...` consumes any surplus positional args (zero or more).
    // Lua semantics: under-supplied args become nil, so even
    // regular params on a variadic function are effectively
    // optional (`function f(a, ...) ... end; f()` is valid;
    // `a` binds to nil). Non-variadic targets keep the strict
    // exact-arity check sparkdown has had since legacy ink.
    const targetIsVariadicTarget =
      paramCount > 0 && !!targetFlow!.args![paramCount - 1]!.isVararg;
    const minRequired = targetIsVariadicTarget ? 0 : paramCount;
    const exceedsMax = !targetIsVariadicTarget && numArgs > paramCount;
    if (numArgs < minRequired || exceedsMax) {
      let butClause: string;
      if (numArgs === 0) {
        butClause = "but there weren't any passed to it";
      } else if (numArgs < minRequired) {
        butClause = `but only got ${numArgs}`;
      } else {
        butClause = `but got ${numArgs}`;
      }

      const requiresClause = targetIsVariadicTarget
        ? `at least ${minRequired} argument${minRequired === 1 ? "" : "s"}`
        : `${paramCount} argument${paramCount === 1 ? "" : "s"}`;

      this.Error(
        `to \`${
          targetFlow!.identifier
        }\` requires ${requiresClause}, ${butClause}`,
      );

      return;
    }

    // Light type-checking for divert target arguments. Iterate only
    // up to `numArgs` so a variadic target with fewer-than-formal
    // call-site args doesn't crash on `this.args[ii]` being undefined.
    const checkCount = Math.min(paramCount, numArgs);
    for (let ii = 0; ii < checkCount; ++ii) {
      const flowArg: Argument = targetFlow!.args![ii]!;
      const divArgExpr: Expression = this.args[ii]!;

      // Expecting a divert target as an argument, let's do some basic type checking
      if (flowArg.isDivertTarget) {
        // Not passing a divert target or any kind of variable reference?
        let varRef = asOrNull(divArgExpr, VariableReference);
        if (!(divArgExpr instanceof DivertTarget) && varRef === null) {
          this.Error(
            `Target \`${
              targetFlow!.identifier
            }\` expects a divert target for the parameter named -> ${
              flowArg.identifier
            } but saw \`${divArgExpr}\``,
            divArgExpr,
          );
        } else if (varRef) {
          // Passing 'a' instead of '-> a'?
          // i.e. read count instead of divert target
          // Unfortunately have to manually resolve here since we're still in code gen
          const knotCountPath = new Path(varRef.pathIdentifiers);
          const targetForCount: ParsedObject | null =
            knotCountPath.ResolveFromContext(varRef);
          if (targetForCount) {
            this.Error(
              `Passing read count of \`${knotCountPath.dotSeparatedComponents}\` instead of a divert target. You probably meant \`${knotCountPath}\``,
            );
          }
        }
      }
    }

    if (targetFlow === null) {
      this.Error(
        "Can't call as a function or with arguments unless it's a knot or stitch",
      );
      return;
    }

    return;
  };

  public readonly CheckExternalArgumentValidity = (context: Story): void => {
    const externalName: string | null = this.target
      ? this.target.firstComponent
      : null;
    const external = context.externals.get(externalName as string);
    if (!external) {
      throw new Error("external not found");
    }

    const externalArgCount: number = external.argumentNames.length;
    let ownArgCount = 0;
    if (this.args) {
      ownArgCount = this.args.length;
    }

    if (ownArgCount !== externalArgCount) {
      this.Error(
        `incorrect number of arguments sent to external function \`${externalName}\`. Expected ${externalArgCount} but got ${ownArgCount}`,
      );
    }
  };

  public override Error(
    message: string,
    source:
      | ParsedObject
      | Identifier
      | ParsedObject
      | DebugMetadata
      | null = null,
    isWarning: boolean = false,
  ): void {
    // Could be getting an error from a nested Divert
    if (source !== this && source) {
      // Forward the warning flag — without it, a warning emitted on
      // a child object (e.g. a DivertTarget's "Can't use a divert
      // target like that" Luau-superset hint) gets re-routed as a
      // severity-1 error when the propagation path crosses a Divert
      // ancestor.
      super.Error(message, source, isWarning);
      return;
    }

    if (this.isFunctionCall) {
      super.Error(`Function call ${message}`, source, isWarning);
    } else {
      super.Error(`Divert ${message}`, source, isWarning);
    }
  }

  public override toString = (): string => {
    let returnString = "";
    if (this.target !== null) {
      returnString += this.target.toString();
    } else {
      return "-> [empty divert]";
    }

    if (this.isTunnel) {
      returnString += " ->";
    }
    if (this.isFunctionCall) {
      returnString += " ()";
    }

    return returnString;
  };

  public override OnResetRuntime(): void {
    this._runtimeDivert = null;
    this.targetContent = null;
  }
}
