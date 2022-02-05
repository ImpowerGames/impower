import {
  Container,
  ControlCommand,
  Divert,
  List,
  ListValue,
  NativeFunctionCall,
  StringValue,
} from "../../../impower-script-engine";
import { Identifier } from "../../types/Identifier";
import { IStory } from "../../types/IStory";
import { ParsedDivert } from "./ParsedDivert";
import { ParsedDivertTarget } from "./ParsedDivertTarget";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedNumber } from "./ParsedNumber";
import { ParsedPath } from "./ParsedPath";
import { ParsedVariableReference } from "./ParsedVariableReference";

export class ParsedFunctionCall extends ParsedExpression {
  shouldPopReturnedValue = false;

  private _proxyDivert: ParsedDivert = null;

  private _divertTargetToCount: ParsedDivertTarget = null;

  private _variableReferenceToCount: ParsedVariableReference = null;

  get name(): string {
    return this._proxyDivert.target.firstComponent;
  }

  get proxyDivert(): ParsedDivert {
    return this._proxyDivert;
  }

  get arguments(): ParsedExpression[] {
    return this._proxyDivert.arguments;
  }

  get runtimeDivert(): Divert {
    return this._proxyDivert.runtimeDivert;
  }

  get isChoiceCount(): boolean {
    return this.name === "CHOICE_COUNT";
  }

  get isTurns(): boolean {
    return this.name === "TURNS";
  }

  get isTurnsSince(): boolean {
    return this.name === "TURNS_SINCE";
  }

  get isRandom(): boolean {
    return this.name === "RANDOM";
  }

  get isSeedRandom(): boolean {
    return this.name === "SEED_RANDOM";
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

  constructor(functionName: Identifier, args: ParsedExpression[]) {
    super();
    this._proxyDivert = new ParsedDivert(
      new ParsedPath([functionName]),
      null,
      args
    );
    this._proxyDivert.isFunctionCall = true;
    this.AddContent(this._proxyDivert);
  }

  override GenerateIntoContainer(container: Container): void {
    const foundList = this.story.ResolveList(this.name);

    let usingProxyDivert = false;

    if (this.isChoiceCount) {
      if (this.arguments.length > 0)
        this.Error("The CHOICE_COUNT() function shouldn't take any arguments");

      container.AddContent(ControlCommand.ChoiceCount());
    } else if (this.isTurns) {
      if (this.arguments.length > 0)
        this.Error("The TURNS() function shouldn't take any arguments");

      container.AddContent(ControlCommand.Turns());
    } else if (this.isTurnsSince || this.isReadCount) {
      const divertTarget = this.arguments[0] as ParsedDivertTarget;
      const variableDivertTarget = this.arguments[0] as ParsedVariableReference;

      if (
        this.arguments.length !== 1 ||
        (divertTarget == null && variableDivertTarget == null)
      ) {
        this.Error(
          `The ${this.name}() function should take one argument: a divert target to the target knot, stitch, gather or choice you want to check. e.g. TURNS_SINCE(-> myKnot)`
        );
        return;
      }

      if (divertTarget) {
        this._divertTargetToCount = divertTarget;
        this.AddContent(this._divertTargetToCount);

        this._divertTargetToCount.GenerateIntoContainer(container);
      } else {
        this._variableReferenceToCount = variableDivertTarget;
        this.AddContent(this._variableReferenceToCount);

        this._variableReferenceToCount.GenerateIntoContainer(container);
      }

      if (this.isTurnsSince) container.AddContent(ControlCommand.TurnsSince());
      else container.AddContent(ControlCommand.ReadCount());
    } else if (this.isRandom) {
      if (this.arguments.length !== 2)
        this.Error(
          "RANDOM should take 2 parameters: a minimum and a maximum integer"
        );

      // We can type check single values, but not complex expressions
      for (let arg = 0; arg < this.arguments.length; arg += 1) {
        if (this.arguments[arg] instanceof ParsedNumber) {
          const num = this.arguments[arg] as ParsedNumber;
          if (!Number.isInteger(num.value)) {
            const paramName = arg === 0 ? "minimum" : "maximum";
            this.Error(`RANDOM's ${paramName} parameter should be an integer`);
          }
        }

        this.arguments[arg].GenerateIntoContainer(container);
      }

      container.AddContent(ControlCommand.Random());
    } else if (this.isSeedRandom) {
      if (this.arguments.length !== 1)
        this.Error("SEED_RANDOM should take 1 parameter - an integer seed");

      const num = this.arguments[0] as ParsedNumber;
      if (num && !Number.isInteger(num.value)) {
        this.Error("SEED_RANDOM's parameter should be an integer seed");
      }

      this.arguments[0].GenerateIntoContainer(container);

      container.AddContent(ControlCommand.SeedRandom());
    } else if (this.isListRange) {
      if (this.arguments.length !== 3)
        this.Error(
          "LIST_RANGE should take 3 parameters - a list, a min and a max"
        );

      for (let arg = 0; arg < this.arguments.length; arg += 1)
        this.arguments[arg].GenerateIntoContainer(container);

      container.AddContent(ControlCommand.ListRange());
    } else if (this.isListRandom) {
      if (this.arguments.length !== 1)
        this.Error("LIST_RANDOM should take 1 parameter - a list");

      this.arguments[0].GenerateIntoContainer(container);

      container.AddContent(ControlCommand.ListRandom());
    } else if (NativeFunctionCall.CallExistsWithName(this.name)) {
      const nativeCall = NativeFunctionCall.CallWithName(this.name);

      if (nativeCall.numberOfParameters !== this.arguments.length) {
        let msg = `${this.name} should take ${nativeCall.numberOfParameters} parameter`;
        if (nativeCall.numberOfParameters > 1) msg += "s";
        this.Error(msg);
      }

      for (let arg = 0; arg < this.arguments.length; arg += 1)
        this.arguments[arg].GenerateIntoContainer(container);

      container.AddContent(NativeFunctionCall.CallWithName(this.name));
    } else if (foundList != null) {
      if (this.arguments.length > 1)
        this.Error(
          "Can currently only construct a list from one integer (or an empty list from a given list definition)"
        );

      // List item from given int
      if (this.arguments.length === 1) {
        container.AddContent(new StringValue(this.name));
        this.arguments[0].GenerateIntoContainer(container);
        container.AddContent(ControlCommand.ListFromInt());
      }

      // Empty list with given origin.
      else {
        const list = new List();
        list.SetInitialOriginName(this.name);
        container.AddContent(new ListValue(list));
      }
    }

    // Normal function call
    else {
      container.AddContent(this._proxyDivert.runtimeObject);
      usingProxyDivert = true;
    }

    // Don't attempt to resolve as a divert if we're not doing a normal function call
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
      container.AddContent(ControlCommand.PopEvaluatedValue());
    }
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    // If we aren't using the proxy divert after all (e.g. if
    // it's a native function call), but we still have arguments,
    // we need to make sure they get resolved since the proxy divert
    // is no longer in the content array.
    if (!this.content.includes(this._proxyDivert) && this.arguments != null) {
      this.arguments.forEach((arg) => {
        arg.ResolveReferences(context);
      });
    }

    if (this._divertTargetToCount) {
      const { divert } = this._divertTargetToCount;
      const attemptingTurnCountOfVariableTarget =
        divert.runtimeDivert.variableDivertName != null;

      if (attemptingTurnCountOfVariableTarget) {
        this.Error(
          `When getting the TURNS_SINCE() of a variable target, remove the '->' - i.e. it should just be TURNS_SINCE(${divert.runtimeDivert.variableDivertName})`
        );
        return;
      }

      const targetObject = divert.targetContent;
      if (targetObject == null) {
        if (!attemptingTurnCountOfVariableTarget) {
          this.Error(
            `Failed to find target for TURNS_SINCE: '${divert.target}'`
          );
        }
      } else {
        targetObject.containerForCounting.turnIndexShouldBeCounted = true;
      }
    } else if (this._variableReferenceToCount) {
      const { runtimeVarRef } = this._variableReferenceToCount;
      if (runtimeVarRef.pathForCount != null) {
        this.Error(
          `Should be ${this.name}(-> ${this._variableReferenceToCount.name}). Usage without the '->' only makes sense for variable targets.`
        );
      }
    }
  }

  static IsBuiltIn(name: string): boolean {
    if (NativeFunctionCall.CallExistsWithName(name)) return true;

    return (
      name === "CHOICE_COUNT" ||
      name === "TURNS_SINCE" ||
      name === "TURNS" ||
      name === "RANDOM" ||
      name === "SEED_RANDOM" ||
      name === "LIST_VALUE" ||
      name === "LIST_RANDOM" ||
      name === "READ_COUNT"
    );
  }

  override ToString(): string {
    const strArgs = this.arguments.map((x) => x.ToString()).join(", ");
    return `${this.name}(${strArgs})`;
  }
}
