import { PushPopType } from "../types/PushPopType";
import { Pointer } from "./Pointer";
import { RuntimeObject } from "./RuntimeObject";

export class ThreadElement {
  public currentPointer: Pointer;

  public inExpressionEvaluation: boolean;

  public temporaryVariables: Record<string, RuntimeObject>;

  public type: PushPopType;

  public evaluationStackHeightWhenPushed = 0;

  public functionStartInOutputStream = 0;

  constructor(
    type: PushPopType,
    pointer: Pointer,
    inExpressionEvaluation = false
  ) {
    this.currentPointer = pointer.Copy();
    this.inExpressionEvaluation = inExpressionEvaluation;
    this.temporaryVariables = {};
    this.type = type;
  }

  public Copy(): ThreadElement {
    const copy = new ThreadElement(
      this.type,
      this.currentPointer,
      this.inExpressionEvaluation
    );
    copy.temporaryVariables = { ...this.temporaryVariables };
    copy.evaluationStackHeightWhenPushed = this.evaluationStackHeightWhenPushed;
    copy.functionStartInOutputStream = this.functionStartInOutputStream;
    return copy;
  }
}
