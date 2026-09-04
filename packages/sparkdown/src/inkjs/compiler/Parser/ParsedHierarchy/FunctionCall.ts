import { Container as RuntimeContainer } from "../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../engine/ControlCommand";
import { lookupStateAwareStdLib } from "../../../engine/StdLib";
import { Divert } from "./Divert/Divert";
import { Divert as RuntimeDivert } from "../../../engine/Divert";
import { DivertTarget } from "./Divert/DivertTarget";
import { Expression } from "./Expression/Expression";
import { NativeFunctionCall } from "../../../engine/NativeFunctionCall";
import { Path } from "./Path";
import { Story } from "./Story";
import { Void as RuntimeVoid } from "../../../engine/Void";
import { VariableReference } from "./Variable/VariableReference";
import { Identifier } from "./Identifier";
import { asOrNull } from "../../../engine/TypeAssertion";

export class FunctionCall extends Expression {
  public static readonly IsBuiltIn = (name: string): boolean => {
    if (NativeFunctionCall.CallExistsWithName(name)) {
      return true;
    }

    return (
      // Legacy per-function ControlCommand builtins that still have
      // compile-time setup not yet migrated to the STDLIB
      // dispatcher: TURNS_SINCE / READ_COUNT need DivertTarget
      // container-counting setup in `ResolveReferences`; LIST_*
      // builtins are list-runtime-native.
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

  get runtimeDivert(): RuntimeDivert {
    return this._proxyDivert.runtimeDivert;
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
  // `STDLIB` (StdLib.ts). Used by `GenerateIntoContainer` to
  // route the call through the generic `RunStdLibFunction` dispatch
  // instead of treating it as a user-defined knot reference.
  get isStateAwareStdLib(): boolean {
    return lookupStateAwareStdLib(this.name) !== null;
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

  // `GenerateIntoContainer` runs again on every recompile, and the
  // incremental pipeline carries parsed nodes forward by identity, so
  // anything generation adds to `this.content` must be added at most
  // once. The counted argument is the same parsed node every pass.
  //
  // Paired with the proxy-divert splice at the end of
  // `GenerateIntoContainer`: with only one of the two guards in place
  // `content` either grows by one entry per pass or empties entirely.
  private AddContentOnce(subContent: DivertTarget | VariableReference): void {
    if (this.content.includes(subContent)) {
      // Already added by an earlier pass. Still re-assert the parent
      // link, which is `AddContent`'s other effect and is read by
      // `DivertTarget.ResolveReferences` to decide whether the target
      // is counted for turns only or for visits as well.
      subContent.parent = this;
      return;
    }

    this.AddContent(subContent);
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    // Which branch below runs is a pure function of `this.name`, which is
    // fixed at construction (`_proxyDivert` is assigned only in this class's
    // constructor, `Divert.target` only in `Divert`'s). Every selector is a
    // name comparison or a static registry lookup — so a parsed node carried
    // forward by the incremental pipeline always takes the SAME branch, and
    // in particular `usingProxyDivert` cannot flip between compiles.
    //
    // Upstream ink had one selector that read per-compile state, a
    // `story.ResolveList(this.name)` arm constructing a list value. It is
    // removed: sparkdown has no LIST type (ink's is replaced by Luau tables —
    // `tests/runtime/Lists.test.ts` is closed by design, see
    // docs/runtime/DIVERGENCES.md), no parsed `ListDefinition` is ever
    // constructed, so `_listDefs` is always empty and that arm was dead. Its
    // one hazard: it removed `_proxyDivert` from `content` (see the splice
    // below) without anything re-adding it, so had the branch ever flipped
    // back to a normal call, the divert would have gone unresolved and
    // undiagnosed. See #329.
    let usingProxyDivert: boolean = false;

    if (this.isTurnsSince || this.isReadCount) {
      const divertTarget = asOrNull(this.args[0], DivertTarget);
      const variableDivertTarget = asOrNull(this.args[0], VariableReference);

      if (
        this.args.length !== 1 ||
        (divertTarget === null && variableDivertTarget === null)
      ) {
        this.Error(
          `The ${this.name}() function should take one argument: a divert target to the target knot, stitch, gather or choice you want to check. e.g. TURNS_SINCE(-> myKnot)`,
        );
        return;
      }

      if (divertTarget) {
        this._divertTargetToCount = divertTarget;
        this.AddContentOnce(this._divertTargetToCount);

        this._divertTargetToCount.GenerateIntoContainer(container);
      } else if (variableDivertTarget) {
        this._variableReferenceToCount = variableDivertTarget;
        this.AddContentOnce(this._variableReferenceToCount);

        this._variableReferenceToCount.GenerateIntoContainer(container);
      }

      if (this.isTurnsSince) {
        container.AddContent(RuntimeControlCommand.TurnsSince());
      } else {
        container.AddContent(RuntimeControlCommand.ReadCount());
      }
    } else if (this.isListRange) {
      if (this.args.length !== 3) {
        this.Error(
          "LIST_RANGE should take 3 parameters - a list, a min and a max",
        );
      }

      for (let ii = 0; ii < this.args.length; ii += 1) {
        this.args[ii]!.GenerateIntoContainer(container);
      }

      container.AddContent(RuntimeControlCommand.ListRange());
    } else if (this.isListRandom) {
      if (this.args.length !== 1) {
        this.Error("LIST_RANDOM should take 1 parameter - a list");
      }

      this.args[0]!.GenerateIntoContainer(container);

      container.AddContent(RuntimeControlCommand.ListRandom());
    } else if (this.isStateAwareStdLib) {
      // Generic state-aware stdlib dispatch. Push args in source
      // order, then emit a `RunStdLibFunction` ControlCommand
      // carrying the function name + arity. Runtime pops the args,
      // looks up `STDLIB[name]`, and calls
      // `fn(story, args)`. Optional return value is pushed back.
      //
      // The `RunStdLibFunction` command carries the ACTUAL arg
      // count from the call site, so variadic entries (`assert`,
      // `print`, `select`) and fixed-arity entries alike validate
      // inside the registered `fn` — no compile-time arity check
      // needed here.
      for (const arg of this.args) {
        arg.GenerateIntoContainer(container);
      }
      container.AddContent(
        RuntimeControlCommand.RunStdLib(this.name, this.args.length),
      );
    } else if (NativeFunctionCall.CallExistsWithName(this.name)) {
      const nativeCall = NativeFunctionCall.CallWithName(this.name);
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

      for (let ii = 0; ii < this.args.length; ii += 1) {
        this.args[ii]!.GenerateIntoContainer(container);
      }

      // Under-application of a fixed-arity native (`math.abs()`): the
      // runtime pops the REGISTERED arity, so an unpadded call site
      // underflows the eval stack with an untrappable JS "trying to
      // pop too many objects". Pad the missing slots with `Void`
      // sentinels — `NativeFunctionCall.Call`'s pure-number-op
      // validation reports them as Lua's trappable "missing argument
      // #N to 'abs'" (and any other op fails its own type validation
      // on the Void rather than corrupting the stack).
      //
      // OVER-application discards the extras Lua-style: all args
      // still EVALUATE (side effects run), then the surplus pops off
      // the top so the native sees the FIRST N — `math.sin(1,2) ==
      // math.sin(1)` (calls.luau line 220); without the pops the
      // native would consume the LAST args and strand the first.
      if (!nativeCall.isVariadic) {
        for (let ii = this.args.length; ii < nativeCall.numberOfParameters; ii += 1) {
          container.AddContent(new RuntimeVoid());
        }
        for (let ii = nativeCall.numberOfParameters; ii < this.args.length; ii += 1) {
          container.AddContent(RuntimeControlCommand.PopEvaluatedValue());
        }
      }

      // Pass the call-site arg count so variadic natives (`__method_*`)
      // know how many parameters to pop off the eval stack. Ignored for
      // fixed-arity natives — their prototype's arity wins.
      container.AddContent(
        NativeFunctionCall.CallWithName(this.name, this.args.length),
      );
    } else {
      // Normal function call
      container.AddContent(this._proxyDivert.runtimeObject);
      usingProxyDivert = true;
    }

    // Don't attempt to resolve as a divert if we're not doing a normal
    // function call. Remove the proxy divert only when it is actually
    // present: `splice(indexOf(...), 1)` finding no match splices at -1
    // and deletes the LAST element rather than nothing, so on a second
    // generation pass it removes whatever `content` happens to end with.
    if (!usingProxyDivert) {
      const proxyIndex = this.content.indexOf(this._proxyDivert);
      if (proxyIndex >= 0) {
        this.content.splice(proxyIndex, 1);
      }
    }

    // Function calls that are used alone on a tilda-based line:
    //  ~ func()
    // Should tidy up any returned value from the evaluation stack,
    // since it's unused.
    if (this.shouldPopReturnedValue) {
      container.AddContent(RuntimeControlCommand.PopEvaluatedValue());
    }
  };

  public override ResolveReferences(context: Story): void {
    super.ResolveReferences(context);

    // If we aren't using the proxy divert after all (e.g. if
    // it's a native function call), but we still have arguments,
    // we need to make sure they get resolved since the proxy divert
    // is no longer in the content array.
    if (!this.content.includes(this._proxyDivert) && this.args !== null) {
      for (const arg of this.args) {
        arg.ResolveReferences(context);
      }
    }

    if (this._divertTargetToCount) {
      const divert = this._divertTargetToCount.divert;
      const attemptingTurnCountOfVariableTarget =
        divert.runtimeDivert.variableDivertName != null;

      if (attemptingTurnCountOfVariableTarget) {
        this.Error(
          `When getting the TURNS_SINCE() of a variable target, remove the '->' - i.e. it should just be TURNS_SINCE(${divert.runtimeDivert.variableDivertName})`,
        );

        return;
      }

      const targetObject = divert.targetContent;
      if (targetObject === null) {
        if (!attemptingTurnCountOfVariableTarget) {
          this.Error(
            `Failed to find target for TURNS_SINCE: \`${divert.target}\``,
          );
        }
      } else {
        if (!targetObject.containerForCounting) {
          throw new Error();
        }

        targetObject.containerForCounting.turnIndexShouldBeCounted = true;
      }
    } else if (this._variableReferenceToCount) {
      const runtimeVarRef = this._variableReferenceToCount.runtimeVarRef;
      if (!runtimeVarRef) {
        throw new Error();
      }

      if (runtimeVarRef.pathForCount !== null) {
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
