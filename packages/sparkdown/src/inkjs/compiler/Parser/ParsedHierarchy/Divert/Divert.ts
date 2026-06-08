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
import { ParsedObject } from "../Object";
import { Path } from "../Path";
import { Story } from "../Story";
import { VariableReference } from "../Variable/VariableReference";
import { DivertTarget } from "./DivertTarget";

export class Divert extends ParsedObject {
  public readonly args: Expression[] = [];

  public readonly pathIdentifiers: Identifier[] | null = null;
  public readonly target: Path | null = null;
  public targetContent: ParsedObject | null = null;
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

  get typeName(): string {
    return "Divert";
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

    // Passing arguments to the knot. Even with zero call-site args,
    // a variadic target needs a `PackTuple(0)` emitted so the
    // function-entry binding still pops a (empty) `MultiValue` into
    // the `__varargs__` slot.
    let targetArgumentsPreview: Argument[] | null = null;
    if (this.targetContent) {
      targetArgumentsPreview = (this.targetContent as FlowBase).args;
    }
    const targetIsVariadicPreview =
      !!targetArgumentsPreview &&
      targetArgumentsPreview.length > 0 &&
      !!targetArgumentsPreview[targetArgumentsPreview.length - 1]!.isVararg;
    const requiresArgCodeGen =
      (this.args !== null && this.args.length > 0) || targetIsVariadicPreview;
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
        // is marked `isVararg`, we pack the surplus call-site args
        // into a single `MultiValue` via `PackTuple(extra)` after
        // they've all been pushed. The function entry then binds N+1
        // params normally — regular args plus one `__varargs__` slot
        // receiving the packed MultiValue. Surplus is computed as
        // `args.length - regular_arity` (clamped to 0+). Caller may
        // supply fewer args than the regular arity, in which case the
        // vararg slot gets `PackTuple(0)` → empty `MultiValue`.
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
        }

        if (targetIsVariadic) {
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

          if (resolveResult.found) {
            // Make sure that the flow was typed correctly, given that we know that this
            // is meant to be a divert target
            if (
              resolveResult.isArgument &&
              resolveResult.ownerFlow &&
              resolveResult.ownerFlow.args
            ) {
              let argument = resolveResult.ownerFlow.args.find(
                (a) => a.identifier?.name == variableTargetName,
              );

              if (argument && !argument.isDivertTarget) {
                this.Error(
                  `Since \`${argument.identifier}\` is used as a variable divert target (on ${this.debugMetadata}), it should be marked as: -> ${argument.identifier}`,
                  resolveResult.ownerFlow,
                );
              }
            }

            this.runtimeDivert.variableDivertName = variableTargetName;
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

    if (this.targetContent) {
      this.runtimeDivert.targetPath = this.targetContent.runtimePath;
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
        if (!this.isFunctionCall) {
          super.Error(
            `${this.target.firstComponent} must be called as a function: ~ ${this.target.firstComponent}()`,
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
      const flowArg: Argument = targetFlow!.args![ii];
      const divArgExpr: Expression = this.args[ii];

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

  public Error(
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
      super.Error(message, source);
      return;
    }

    if (this.isFunctionCall) {
      super.Error(`Function call ${message}`, source, isWarning);
    } else {
      super.Error(`Divert ${message}`, source, isWarning);
    }
  }

  public toString = (): string => {
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
