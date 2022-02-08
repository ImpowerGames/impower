import {
  Container,
  Divert,
  DivertTargetValue,
} from "../../../impower-script-engine";
import { IDivert } from "../../types/IDivert";
import { IDivertTarget } from "../../types/IDivertTarget";
import { isFlowBase } from "../../types/IFlowBase";
import { IStory } from "../../types/IStory";
import { ParsedBinaryExpression } from "./ParsedBinaryExpression";
import { ParsedChoice } from "./ParsedChoice";
import { ParsedConditional } from "./ParsedConditional";
import { ParsedConditionalSingleBranch } from "./ParsedConditionalSingleBranch";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedFunctionCall } from "./ParsedFunctionCall";
import { ParsedMultipleConditionExpression } from "./ParsedMultipleConditionExpression";
import { ParsedObject } from "./ParsedObject";
import { ParsedVariableReference } from "./ParsedVariableReference";

export class ParsedDivertTarget
  extends ParsedExpression
  implements IDivertTarget
{
  divert: IDivert = null;

  private _runtimeDivertTargetValue: DivertTargetValue = null;

  private _runtimeDivert: Divert = null;

  constructor(divert: IDivert) {
    super();
    this.divert = this.AddContent(
      divert as unknown as ParsedObject
    ) as unknown as IDivert;
  }

  override GenerateIntoContainer(container: Container): void {
    this.divert.GenerateRuntimeObject();

    this._runtimeDivert = this.divert.runtimeDivert;
    this._runtimeDivertTargetValue = new DivertTargetValue();

    container.AddContent(this._runtimeDivertTargetValue);
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    if (this.divert.isDone || this.divert.isEnd) {
      this.Error(
        "Can't Can't use -> DONE or -> END as variable divert targets",
        this
      );
      return;
    }

    let usageContext = this as ParsedObject;
    while (usageContext && usageContext instanceof ParsedExpression) {
      let badUsage = false;
      let foundUsage = false;

      const usageParent = usageContext.parent;
      if (usageParent instanceof ParsedBinaryExpression) {
        // Only allowed to compare for equality

        const binaryExprParent = usageParent;
        if (
          (binaryExprParent as ParsedBinaryExpression) &&
          binaryExprParent.opName !== "==" &&
          binaryExprParent.opName !== "!="
        ) {
          badUsage = true;
        } else {
          if (
            !(
              binaryExprParent.leftExpression instanceof ParsedDivertTarget ||
              binaryExprParent.leftExpression instanceof ParsedVariableReference
            )
          ) {
            badUsage = true;
          }
          if (
            !(
              binaryExprParent.rightExpression instanceof ParsedDivertTarget ||
              binaryExprParent.rightExpression instanceof
                ParsedVariableReference
            )
          ) {
            badUsage = true;
          }
        }
        foundUsage = true;
      } else if (usageParent instanceof ParsedFunctionCall) {
        const funcCall = usageParent;
        if (!funcCall.isTurnsSince && !funcCall.isReadCount) {
          badUsage = true;
        }
        foundUsage = true;
      } else if (usageParent instanceof ParsedExpression) {
        badUsage = true;
        foundUsage = true;
      } else if (usageParent instanceof ParsedMultipleConditionExpression) {
        badUsage = true;
        foundUsage = true;
      } else if (
        usageParent instanceof ParsedChoice &&
        usageParent.condition === usageContext
      ) {
        badUsage = true;
        foundUsage = true;
      } else if (
        usageParent instanceof ParsedConditional ||
        usageParent instanceof ParsedConditionalSingleBranch
      ) {
        badUsage = true;
        foundUsage = true;
      }

      if (badUsage) {
        this.Error(
          `Can't use a divert target like that. Did you intend to call '${this.divert.target}' as a function: likeThis(), or check the read count: likeThis, with no arrows?`,
          this
        );
      }

      if (foundUsage) break;

      usageContext = usageParent as ParsedObject;
    }

    // Example ink for this case:
    //
    //     VAR x = -> blah
    //
    // ...which means that "blah" is expected to be a literal stitch  target rather
    // than a variable name. We can't really intelligently recover from this (e.g. if blah happens to
    // contain a divert target itself) since really we should be generating a variable reference
    // rather than a concrete DivertTarget, so we list it as an error.
    if (this._runtimeDivert.hasVariableTarget)
      this.Error(
        `Since '${this.divert.target.dotSeparatedComponents}' is a variable, it shouldn't be preceded by '->' here.`
      );

    // Main resolve
    this._runtimeDivertTargetValue.targetPath = this._runtimeDivert.targetPath;

    // Tell hard coded (yet variable) divert targets that they also need to be counted
    // TODO: Only detect DivertTargets that are values rather than being used directly for
    // read or turn counts. Should be able to detect this by looking for other uses of containerForCounting
    const { targetContent } = this.divert;
    if (targetContent != null) {
      const target = targetContent.containerForCounting;
      if (target != null) {
        // Purpose is known: used directly in TURNS_SINCE(-> divTarg)
        const parentFunc = this.parent;
        if (
          parentFunc instanceof ParsedFunctionCall &&
          parentFunc.isTurnsSince
        ) {
          target.turnIndexShouldBeCounted = true;
        }

        // Unknown purpose, count everything
        else {
          target.visitsShouldBeCounted = true;
          target.turnIndexShouldBeCounted = true;
        }
      }

      // Unfortunately not possible:
      // https://github.com/inkle/ink/issues/538
      //
      // VAR func = -> double
      //
      // === function double(ref x)
      //    ~ x = x * 2
      //
      // Because when generating the parameters for a function
      // to be called, it needs to know ahead of time when
      // compiling whether to pass a variable reference or value.
      //
      const targetFlow = targetContent;
      if (isFlowBase(targetFlow) && targetFlow.arguments != null) {
        targetFlow.arguments.forEach((arg) => {
          if (arg.isByReference) {
            this.Error(
              `Can't store a divert target to a knot or function that has by-reference arguments ('${targetFlow.identifier}' has 'ref ${arg.identifier}').`
            );
          }
        });
      }
    }
  }

  // Equals override necessary in order to check for CONST multiple definition equality
  override Equals(obj: unknown): boolean {
    const otherDivTarget = obj;
    if (!(otherDivTarget instanceof ParsedDivertTarget)) {
      return false;
    }

    const targetStr = this.divert.target.dotSeparatedComponents;
    const otherTargetStr = otherDivTarget.divert.target.dotSeparatedComponents;

    return targetStr === otherTargetStr;
  }
}
