import { Container as RuntimeContainer } from "../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../engine/ControlCommand";
import { lookupStateAwareStdLib } from "../../../engine/StdLib";
import { Divert } from "./Divert/Divert";
import { Divert as RuntimeDivert } from "../../../engine/Divert";
import { DivertTarget } from "./Divert/DivertTarget";
import { Expression } from "./Expression/Expression";
import { InkList as RuntimeInkList } from "../../../engine/InkList";
import { ListValue } from "../../../engine/Value";
import { NativeFunctionCall } from "../../../engine/NativeFunctionCall";
import { NumberExpression } from "./Expression/NumberExpression";
import { Path } from "./Path";
import { Story } from "./Story";
import { StringValue } from "../../../engine/Value";
import { VariableReference } from "./Variable/VariableReference";
import { Identifier } from "./Identifier";
import { asOrNull } from "../../../engine/TypeAssertion";
import { DebugMetadata } from "../../../engine/DebugMetadata";

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

  get typeName(): string {
    return "FunctionCall";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    const foundList = this.story.ResolveList(this.name);

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
        this.AddContent(this._divertTargetToCount);

        this._divertTargetToCount.GenerateIntoContainer(container);
      } else if (variableDivertTarget) {
        this._variableReferenceToCount = variableDivertTarget;
        this.AddContent(this._variableReferenceToCount);

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
        this.args[ii].GenerateIntoContainer(container);
      }

      container.AddContent(RuntimeControlCommand.ListRange());
    } else if (this.isListRandom) {
      if (this.args.length !== 1) {
        this.Error("LIST_RANDOM should take 1 parameter - a list");
      }

      this.args[0].GenerateIntoContainer(container);

      container.AddContent(RuntimeControlCommand.ListRandom());
    } else if (this.isStateAwareStdLib) {
      // Generic state-aware stdlib dispatch. Push args in source
      // order, then emit a `RunStdLibFunction` ControlCommand
      // carrying the function name + arity. Runtime pops the args,
      // looks up `STDLIB[name]`, and calls
      // `fn(story, args)`. Optional return value is pushed back.
      //
      // The lowerer (`makeGlobalFunctionCall` in lowerExpression.ts)
      // normalizes the call site before reaching here — e.g.
      // pads `assert(cond)` to `assert(cond, "assertion failed")`
      // so the runtime always sees the registered arity. This means
      // we don't need per-function arity validation here — the
      // lowerer or the registered `fn` handles it.
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
        this.args[ii].GenerateIntoContainer(container);
      }

      // Pass the call-site arg count so variadic natives (`__method_*`)
      // know how many parameters to pop off the eval stack. Ignored for
      // fixed-arity natives — their prototype's arity wins.
      container.AddContent(
        NativeFunctionCall.CallWithName(this.name, this.args.length),
      );
    } else if (foundList !== null) {
      if (this.args.length > 1) {
        this.Error(
          "Can currently only construct a list from one integer (or an empty list from a given list definition)",
        );
      }

      // List item from given int
      if (this.args.length === 1) {
        container.AddContent(new StringValue(this.name));
        this.args[0].GenerateIntoContainer(container);
        container.AddContent(RuntimeControlCommand.ListFromInt());
      } else {
        // Empty list with given origin.
        const list = new RuntimeInkList();
        list.SetInitialOriginName(this.name);
        container.AddContent(new ListValue(list));
      }
    } else {
      // Normal function call
      container.AddContent(this._proxyDivert.runtimeObject);
      usingProxyDivert = true;
    }

    // Don't attempt to resolve as a divert if we're not doing a normal function call
    if (!usingProxyDivert) {
      this.content.splice(this.content.indexOf(this._proxyDivert), 1);
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

  public readonly toString = (): string => {
    const strArgs = this.args.join(", ");
    return `${this.name}(${strArgs})`;
  };

  override OnResetRuntime(): void {
    this._divertTargetToCount = null;
    this._variableReferenceToCount = null;
  }
}
