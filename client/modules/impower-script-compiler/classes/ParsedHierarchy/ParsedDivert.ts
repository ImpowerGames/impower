import {
  Container,
  ControlCommand,
  Debug,
  Divert,
  Path,
  RuntimeObject,
  VariablePointerValue,
} from "../../../impower-script-engine";
import { Argument } from "../../types/Argument";
import { IDivert } from "../../types/IDivert";
import { isFlowBase } from "../../types/IFlowBase";
import { IObject } from "../../types/IObject";
import { IStory } from "../../types/IStory";
import { isVariableReference } from "../../types/IVariableReference";
import { ParsedDivertTarget } from "./ParsedDivertTarget";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedFunctionCall } from "./ParsedFunctionCall";
import { ParsedObject } from "./ParsedObject";
import { ParsedPath } from "./ParsedPath";

export class ParsedDivert extends ParsedObject implements IDivert {
  target: ParsedPath = null;

  targetContent: ParsedObject = null;

  arguments: ParsedExpression[] = null;

  runtimeDivert: Divert = null;

  isFunctionCall = false;

  isEmpty = false;

  isTunnel = false;

  isThread = false;

  get isEnd(): boolean {
    return this.target != null && this.target.dotSeparatedComponents === "END";
  }

  get isDone(): boolean {
    return this.target != null && this.target.dotSeparatedComponents === "DONE";
  }

  constructor(
    target: ParsedPath,
    targetContent: ParsedObject = null,
    args: ParsedExpression[] = null
  ) {
    super();
    this.target = target;
    this.targetContent = targetContent;
    this.arguments = args;

    if (args != null) {
      this.AddContent(args);
    }
  }

  override GenerateRuntimeObject(): RuntimeObject {
    // End = end flow immediately
    // Done = return from thread or instruct the flow that it's safe to exit
    if (this.isEnd) {
      return ControlCommand.End();
    }
    if (this.isDone) {
      return ControlCommand.Done();
    }

    this.runtimeDivert = new Divert();

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

    // Passing arguments to the knot
    const requiresArgCodeGen =
      this.arguments != null && this.arguments.length > 0;
    if (
      requiresArgCodeGen ||
      this.isFunctionCall ||
      this.isTunnel ||
      this.isThread
    ) {
      const container = new Container();

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
          container.AddContent(ControlCommand.EvalStart());
        }

        let targetArguments: Argument[] = null;
        if (this.targetContent && isFlowBase(this.targetContent))
          targetArguments = this.targetContent.arguments;

        for (let i = 0; i < this.arguments.length; i += 1) {
          const argToPass: ParsedExpression = this.arguments[i];
          let argExpected: Argument = null;
          if (targetArguments != null && i < targetArguments.length)
            argExpected = targetArguments[i];

          // Pass by reference: argument needs to be a variable reference
          if (argExpected != null && argExpected.isByReference) {
            const varRef = argToPass;
            if (!isVariableReference(varRef)) {
              this.Error(
                `Expected variable name to pass by reference to 'ref ${
                  argExpected.identifier
                }' but saw ${argToPass.ToString()}`
              );
              break;
            }

            // Check that we're not attempting to pass a read count by reference
            const targetPath = new ParsedPath(varRef.pathIdentifiers);
            const targetForCount = targetPath.ResolveFromContext(this);
            if (targetForCount != null) {
              this.Error(
                `can't pass a read count by reference. '${targetPath.dotSeparatedComponents}' is a knot/stitch/label, but '${this.target.dotSeparatedComponents}' requires the name of a VAR to be passed.`
              );
              break;
            }

            const varPointer = new VariablePointerValue(varRef.name);
            container.AddContent(varPointer);
          }

          // Normal value being passed: evaluate it as normal
          else {
            argToPass.GenerateIntoContainer(container);
          }
        }

        // Function calls were already in an evaluation context
        if (!this.isFunctionCall) {
          container.AddContent(ControlCommand.EvalEnd());
        }
      }

      // Starting a thread? A bit like a push to the call stack below... but not.
      // It sort of puts the call stack on a thread stack (argh!) - forks the full flow.
      if (this.isThread) {
        container.AddContent(ControlCommand.StartThread());
      }

      // If this divert is a function call, tunnel, we push to the call stack
      // so we can return again
      else if (this.isFunctionCall || this.isTunnel) {
        this.runtimeDivert.pushesToStack = true;
        this.runtimeDivert.stackPushType = this.isFunctionCall
          ? "Function"
          : "Tunnel";
      }

      // Jump into the "function" (knot/stitch)
      container.AddContent(this.runtimeDivert);

      return container;
    }

    // Simple divert

    return this.runtimeDivert;
  }

  // When the divert is to a target that's actually a variable name
  // rather than an explicit knot/stitch name, try interpretting it
  // as such by getting the variable name.
  PathAsVariableName(): string {
    return this.target.firstComponent;
  }

  ResolveTargetContent(): void {
    if (this.isEmpty || this.isEnd) {
      return;
    }

    if (this.targetContent == null) {
      // Is target of this divert a variable name that will be de-referenced
      // at runtime? If so, there won't be any further reference resolution
      // we can do at this point.
      const variableTargetName = this.PathAsVariableName();
      if (variableTargetName != null) {
        const flowBaseScope = this.ClosestFlowBase();
        const resolveResult = flowBaseScope.ResolveVariableWithName(
          variableTargetName,
          this
        );
        if (resolveResult.found) {
          // Make sure that the flow was typed correctly, given that we know that this
          // is meant to be a divert target
          if (resolveResult.isArgument && isFlowBase(resolveResult.ownerFlow)) {
            const argument = resolveResult.ownerFlow.arguments.filter(
              (a) => a.identifier.name === variableTargetName
            )[0];
            if (!argument.isDivertTarget) {
              this.Error(
                `Since '${argument.identifier}' is used as a variable divert target (on ${this.debugMetadata}), it should be marked as: -> ${argument.identifier}`,
                resolveResult.ownerFlow
              );
            }
          }

          this.runtimeDivert.variableDivertName = variableTargetName;
          return;
        }
      }

      this.targetContent = this.target.ResolveFromContext(this) as ParsedObject;
    }
  }

  override ResolveReferences(context: IStory): void {
    if (this.isEmpty || this.isEnd || this.isDone) {
      return;
    }

    if (this.targetContent) {
      this.runtimeDivert.targetPath = this.targetContent.runtimePath;
    }

    // Resolve children (the arguments)
    super.ResolveReferences(context);

    // May be null if it's a built in function (e.g. TURNS_SINCE)
    // or if it's a variable target.
    const targetFlow = this.targetContent;
    if (isFlowBase(targetFlow)) {
      if (!targetFlow.isFunction && this.isFunctionCall) {
        super.Error(
          `${targetFlow.identifier} hasn't been marked as a function, but it's being called as one. Do you need to delcare the knot as '== function ${targetFlow.identifier} =='?`
        );
      } else if (
        targetFlow.isFunction &&
        !this.isFunctionCall &&
        !(this.parent instanceof ParsedDivertTarget)
      ) {
        super.Error(
          `${targetFlow.identifier} can't be diverted to. It can only be called as a function since it's been marked as such: '${targetFlow.identifier}(...)'`
        );
      }
    }

    // Check validity of target content
    const targetWasFound = this.targetContent != null;
    let isBuiltIn = false;
    let isExternal = false;

    if (this.target.numberOfComponents === 1) {
      // BuiltIn means TURNS_SINCE, CHOICE_COUNT, RANDOM or SEED_RANDOM
      isBuiltIn = ParsedFunctionCall.IsBuiltIn(this.target.firstComponent);

      // Client-bound function?
      isExternal = context.IsExternal(this.target.firstComponent);

      if (isBuiltIn || isExternal) {
        if (!this.isFunctionCall) {
          super.Error(
            `${this.target.firstComponent} must be called as a function: ~ ${this.target.firstComponent}()`
          );
        }
        if (isExternal) {
          this.runtimeDivert.isExternal = true;
          if (this.arguments != null) {
            this.runtimeDivert.externalArgs = this.arguments.length;
          }
          this.runtimeDivert.pushesToStack = false;
          this.runtimeDivert.targetPath = new Path(this.target.firstComponent);
          this.CheckExternalArgumentValidity(context);
        }
        return;
      }
    }

    // Variable target?
    if (this.runtimeDivert.variableDivertName != null) {
      return;
    }

    if (!targetWasFound && !isBuiltIn && !isExternal)
      this.Error(`target not found: '${this.target}'`);
  }

  // Returns false if there's an error
  private CheckArgumentValidity(): void {
    if (this.isEmpty) {
      return;
    }

    // Argument passing: Check for errors in number of arguments
    let numArgs = 0;
    if (this.arguments != null && this.arguments.length > 0) {
      numArgs = this.arguments.length;
    }

    // Missing content?
    // Can't check arguments properly. It'll be due to some
    // other error though, so although there's a problem and
    // we report false, we don't need to report a specific error.
    // It may also be because it's a valid call to an external
    // function, that we check at the resolve stage.
    if (this.targetContent == null) {
      return;
    }

    const targetFlow = isFlowBase(this.targetContent)
      ? this.targetContent
      : null;

    // No error, crikey!
    if (numArgs === 0 && (targetFlow == null || !targetFlow.hasParameters)) {
      return;
    }

    if (targetFlow == null && numArgs > 0) {
      this.Error(
        "target needs to be a knot or stitch in order to pass arguments"
      );
      return;
    }

    if (targetFlow.arguments == null && numArgs > 0) {
      this.Error(`target (${targetFlow.name}) doesn't take parameters`);
      return;
    }

    if (this.parent instanceof ParsedDivertTarget) {
      if (numArgs > 0) {
        this.Error("can't store arguments in a divert target variable");
      }
      return;
    }

    const paramCount = targetFlow.arguments.length;
    if (paramCount !== numArgs) {
      let butClause: string;
      if (numArgs === 0) {
        butClause = "but there weren't any passed to it";
      } else if (numArgs < paramCount) {
        butClause = `but only got ${numArgs}`;
      } else {
        butClause = `but got ${numArgs}`;
      }
      this.Error(
        `to '${targetFlow.identifier}' requires ${paramCount} arguments, ${butClause}`
      );
      return;
    }

    // Light type-checking for divert target arguments
    for (let i = 0; i < paramCount; i += 1) {
      const flowArg = targetFlow.arguments[i];
      const divArgExpr = this.arguments[i];

      // Expecting a divert target as an argument, let's do some basic type checking
      if (flowArg.isDivertTarget) {
        // Not passing a divert target or any kind of variable reference?
        const varRef = isVariableReference(divArgExpr) ? divArgExpr : null;
        if (!(divArgExpr instanceof ParsedDivertTarget) && varRef == null) {
          this.Error(
            `Target '${targetFlow.identifier}' expects a divert target for the parameter named -> ${flowArg.identifier} but saw ${divArgExpr}`,
            divArgExpr
          );
        }

        // Passing 'a' instead of '-> a'?
        // i.e. read count instead of divert target
        else if (varRef != null) {
          // Unfortunately have to manually resolve here since we're still in code gen
          const knotCountPath = new ParsedPath(varRef.pathIdentifiers);
          const targetForCount = knotCountPath.ResolveFromContext(varRef);
          if (targetForCount != null) {
            this.Error(
              `Passing read count of '${knotCountPath.dotSeparatedComponents}' instead of a divert target. You probably meant '${knotCountPath}'`
            );
          }
        }
      }
    }

    if (targetFlow == null) {
      this.Error(
        "Can't call as a function or with arguments unless it's a knot or stitch"
      );
    }
  }

  private CheckExternalArgumentValidity(context: IStory): void {
    const externalName = this.target.firstComponent;
    const external = context.externals[externalName];
    const found = external !== undefined;
    Debug.Assert(found, "external not found");

    const externalArgCount = external.argumentNames.length;
    let ownArgCount = 0;
    if (this.arguments != null) {
      ownArgCount = this.arguments.length;
    }

    if (ownArgCount !== externalArgCount) {
      this.Error(
        `incorrect number of arguments sent to external function '${externalName}'. Expected ${externalArgCount} but got ${ownArgCount}`
      );
    }
  }

  override Error(message: string, source?: IObject, isWarning = false): void {
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

  override ToString(): string {
    if (this.target != null) return this.target.ToString();
    return "-> <empty divert>";
  }
}
