import { lookupStateAwareStdLib } from "../../../../runtime/StdLib";
import { Divert } from "./Divert/Divert";
import { DivertTarget } from "./Divert/DivertTarget";
import { Expression } from "./Expression/Expression";
import { NativeFunctionCall } from "../../../../runtime/NativeFunctionCall";
import { Path } from "./Path";
import { Story } from "./Story";
import { VariableReference } from "./Variable/VariableReference";
import { Identifier } from "./Identifier";
import { asOrNull } from "../../../../runtime/TypeAssertion";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import {
  CALL_DISCARD,
  CALL_OPEN,
  COUNT_TURNS,
  ConstValue,
  Op,
} from "../../../../program/ProgramInstructions";
import { displayLeavesLineOpen } from "../../../../program/displayCallFlags";
import { resolveChild } from "./Object";

export class FunctionCall extends Expression {
  public static readonly IsBuiltIn = (name: string): boolean => {
    if (NativeFunctionCall.CallExistsWithName(name)) {
      return true;
    }

    return (
      // Legacy per-function ControlCommand builtins that still have
      // compile-time setup not yet migrated to the STDLIB
      // dispatcher: TURNS_SINCE / READ_COUNT take their target's
      // count; LIST_* builtins are list-runtime-native.
      name === "TURNS_SINCE" ||
      name === "READ_COUNT" ||
      name === "LIST_VALUE" ||
      name === "LIST_RANDOM" ||
      // State-aware Luau globals + namespaced state-aware functions
      // (e.g. `plural.category`, `math.random`, `assert`, ...)
      // registered in `STDLIB` in StdLib.ts. Adding a new
      // entry there immediately makes it a recognized builtin here
      // — no list to update.
      lookupStateAwareStdLib(name) !== null
    );
  };

  private _proxyDivert: Divert;
  get proxyDivert(): Divert {
    return this._proxyDivert;
  }
  private _divertTargetToCount: DivertTarget | null = null;
  private _variableReferenceToCount: VariableReference | null = null;

  get name(): string {
    return (this._proxyDivert.target as Path).firstComponent || "";
  }

  get args(): Expression[] {
    return this._proxyDivert.args;
  }

  get isTurnsSince(): boolean {
    return this.name === "TURNS_SINCE";
  }

  get isListRange(): boolean {
    return this.name === "LIST_RANGE";
  }

  get isListRandom(): boolean {
    return this.name === "LIST_RANDOM";
  }

  get isReadCount(): boolean {
    return this.name === "READ_COUNT";
  }

  // True when `this.name` is registered as a state-aware global in
  // `STDLIB` (StdLib.ts). Used by `EmitExpression` to route the call
  // through the generic `CallStd` dispatch instead of treating it as a
  // user-defined knot reference.
  get isStateAwareStdLib(): boolean {
    return lookupStateAwareStdLib(this.name) !== null;
  }

  /** Whether the call calls a function of the story, or what a variable of
   *  that name holds, rather than a builtin. */
  get isUserCall(): boolean {
    return (
      !this.isTurnsSince &&
      !this.isReadCount &&
      !this.isListRange &&
      !this.isListRandom &&
      !this.isStateAwareStdLib &&
      !NativeFunctionCall.CallExistsWithName(this.name)
    );
  }

  public shouldPopReturnedValue: boolean = false;

  constructor(functionName: Identifier, args: Expression[]) {
    super();

    this.identifier = functionName;
    this._proxyDivert = new Divert([functionName], args);
    this._proxyDivert.isFunctionCall = true;
    this.AddContent(this._proxyDivert);
  }

  override get typeName(): string {
    return "FunctionCall";
  }

  // `PrepareIntoContainer` runs again on every recompile, and the
  // incremental pipeline carries parsed nodes forward by identity, so
  // anything preparation adds to `this.content` must be added at most
  // once. The counted argument is the same parsed node every pass.
  //
  // Paired with the proxy-divert splice at the end of
  // `PrepareIntoContainer`: with only one of the two guards in place
  // `content` either grows by one entry per pass or empties entirely.
  private AddContentOnce(subContent: DivertTarget | VariableReference): void {
    if (this.content.includes(subContent)) {
      // Already added by an earlier pass. Still re-assert the parent
      // link, which is `AddContent`'s other effect.
      subContent.parent = this;
      return;
    }

    this.AddContent(subContent);
  }

  /** The call's preparation: the branch by the call's name, with its
   *  diagnostics, the target a read
   *  count or turns since counts taken into the call's content, the
   *  arguments prepared, and the proxy divert prepared for a call of a
   *  function and taken out of the content for any other call. */
  public override PrepareIntoContainer(): void {
    let usingProxyDivert: boolean = false;

    if (this.isTurnsSince || this.isReadCount) {
      const countTarget = this.TakeCountTarget();
      if (!countTarget) {
        return;
      }
      countTarget.PrepareIntoContainer();
    } else if (this.isListRange) {
      this.CheckListFunctionArity();
      for (let ii = 0; ii < this.args.length; ii += 1) {
        this.args[ii]!.PrepareIntoContainer();
      }
    } else if (this.isListRandom) {
      this.CheckListFunctionArity();
      this.args[0]!.PrepareIntoContainer();
    } else if (this.isStateAwareStdLib) {
      for (const arg of this.args) {
        arg.PrepareIntoContainer();
      }
    } else if (NativeFunctionCall.CallExistsWithName(this.name)) {
      this.CheckNativeArity(NativeFunctionCall.CallWithName(this.name));
      for (let ii = 0; ii < this.args.length; ii += 1) {
        this.args[ii]!.PrepareIntoContainer();
      }
    } else {
      this._proxyDivert.prepare();
      usingProxyDivert = true;
    }

    if (!usingProxyDivert) {
      const proxyIndex = this.content.indexOf(this._proxyDivert);
      if (proxyIndex >= 0) {
        this.content.splice(proxyIndex, 1);
      }
    }
  }

  /** The target a read count or turns since counts, which preparation
   *  checks and takes into the call's content: the call's one argument, a
   *  divert target or a variable's reference. Any other arguments are
   *  reported and the result is null, which ends the call's preparation. */
  protected TakeCountTarget(): DivertTarget | VariableReference | null {
    const divertTarget = asOrNull(this.args[0], DivertTarget);
    const variableDivertTarget = asOrNull(this.args[0], VariableReference);

    if (
      this.args.length !== 1 ||
      (divertTarget === null && variableDivertTarget === null)
    ) {
      this.Error(
        `The ${this.name}() function should take one argument: a divert target to the target knot, stitch, gather or choice you want to check. e.g. TURNS_SINCE(-> myKnot)`,
      );
      return null;
    }

    if (divertTarget) {
      this._divertTargetToCount = divertTarget;
      this.AddContentOnce(this._divertTargetToCount);
      return divertTarget;
    }
    this._variableReferenceToCount = variableDivertTarget;
    this.AddContentOnce(this._variableReferenceToCount!);
    return variableDivertTarget;
  }

  /** The check of a LIST_RANGE's or a LIST_RANDOM's number of arguments,
   *  which preparation makes. */
  protected CheckListFunctionArity(): void {
    if (this.isListRange && this.args.length !== 3) {
      this.Error(
        "LIST_RANGE should take 3 parameters - a list, a min and a max",
      );
    } else if (this.isListRandom && this.args.length !== 1) {
      this.Error("LIST_RANDOM should take 1 parameter - a list");
    }
  }

  /** The check of a native call's number of arguments, which preparation
   *  makes. */
  protected CheckNativeArity(nativeCall: NativeFunctionCall): void {
    // Variadic natives (currently the `__method_*` builtin-method
    // family) validate arity at runtime inside the method impl, so
    // skip the compile-time assertion for those.
    if (
      !nativeCall.isVariadic &&
      nativeCall.numberOfParameters !== this.args.length
    ) {
      let msg = `${this.name} should take ${nativeCall.numberOfParameters} parameter`;
      if (nativeCall.numberOfParameters > 1) {
        msg += "s";
      }
      msg += `, got ${this.args.length}`;
      // Demoted from error → warning so Luau patterns that
      // deliberately call a native with the wrong arity to trigger
      // a trappable runtime error (e.g. `pcall(function() return
      // math.abs() end)` to verify the runtime "missing argument"
      // path) compile cleanly. The runtime still validates arity
      // and throws "Unexpected number of parameters" — which pcall
      // catches as a regular Luau error. Calls outside pcall fail
      // at runtime with the same error message, matching what Luau
      // does.
      this.Error(msg, this, true);
    }
  }

  // A call of a builtin the program engine dispatches: its arguments, then
  // `CallStd`, whose discard flag stands for the pop after a statement's
  // call. A `display` table that writes no newline sets the open flag. A
  // native function or operator is its arguments, padded with void or cut to
  // its arity as the runtime objects are, then `Native`. A call of a function
  // is its divert's code (`Divert.EmitCall`), then `Pop` where the value is
  // discarded. A read count or turns since is its target's symbol value, or
  // the variable that holds one, then `CountOf`.
  public override EmitExpression(emitter: ProgramEmitter): void {
    if (this.isTurnsSince || this.isReadCount) {
      if (this.args.length !== 1) {
        emitter.unsupported(this.name);
      }
      emitter.emitObject(this.args[0]!);
      emitter.emit(Op.CountOf, 0, 0, this.isTurnsSince ? COUNT_TURNS : 0);
      if (this.shouldPopReturnedValue) {
        emitter.emit(Op.Pop);
      }
      return;
    }
    if (this.isListRange || this.isListRandom) {
      emitter.unsupported("list");
    }
    if (this.isStateAwareStdLib) {
      for (const arg of this.args) {
        emitter.emitObject(arg);
      }
      let flags = this.shouldPopReturnedValue ? CALL_DISCARD : 0;
      if (this.name === "display" && displayLeavesLineOpen(this.args)) {
        flags |= CALL_OPEN;
      }
      emitter.emit(
        Op.CallStd,
        emitter.string(this.name),
        this.args.length,
        flags,
      );
      return;
    }
    if (NativeFunctionCall.CallExistsWithName(this.name)) {
      const native = NativeFunctionCall.CallWithName(this.name);
      for (const arg of this.args) {
        emitter.emitObject(arg);
      }
      if (!native.isVariadic) {
        for (let i = this.args.length; i < native.numberOfParameters; i += 1) {
          emitter.emit(Op.Const, 0, ConstValue.Void);
        }
        for (let i = native.numberOfParameters; i < this.args.length; i += 1) {
          emitter.emit(Op.Pop);
        }
      }
      emitter.emit(Op.Native, emitter.string(this.name), this.args.length);
      if (this.shouldPopReturnedValue) {
        emitter.emit(Op.Pop);
      }
      return;
    }
    this._proxyDivert.EmitCall(emitter);
    if (this.shouldPopReturnedValue) {
      emitter.emit(Op.Pop);
    }
  }

  public override ResolveWith(context: Story): void {
    super.ResolveWith(context);

    // If we aren't using the proxy divert after all (e.g. if
    // it's a native function call), but we still have arguments,
    // we need to make sure they get resolved since the proxy divert
    // is no longer in the content array.
    if (!this.content.includes(this._proxyDivert) && this.args !== null) {
      for (const arg of this.args) {
        resolveChild(arg, context);
      }
    }

    if (this._divertTargetToCount) {
      const divert = this._divertTargetToCount.divert;
      if (!divert.isGenerated) {
        throw new Error();
      }
      const attemptingTurnCountOfVariableTarget =
        divert.variableDivertName != null;

      if (attemptingTurnCountOfVariableTarget) {
        this.Error(
          `When getting the TURNS_SINCE() of a variable target, remove the '->' - i.e. it should just be TURNS_SINCE(${divert.variableDivertName})`,
        );

        return;
      }

      // The program counts every counted symbol, so a found target needs
      // nothing more.
      if (divert.targetContent === null) {
        this.Error(
          `Failed to find target for TURNS_SINCE: \`${divert.target}\``,
        );
      }
    } else if (this._variableReferenceToCount) {
      if (!this._variableReferenceToCount.isReferencePrepared) {
        throw new Error();
      }

      if (this._variableReferenceToCount.resolvedAs === "count") {
        this.Error(
          `Should be \`${FunctionCall.name}(-> ${this._variableReferenceToCount.name})\`. Usage without \`->\` only makes sense for variable targets.`,
        );
      }
    }
  }

  public override readonly toString = (): string => {
    const strArgs = this.args.join(", ");
    return `${this.name}(${strArgs})`;
  };

  override OnResetRuntime(): void {
    this._divertTargetToCount = null;
    this._variableReferenceToCount = null;
  }
}
