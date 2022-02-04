import { PushPopType } from "../types/PushPopType";
import { Container } from "./Container";
import { ImpowerObject } from "./ImpowerObject";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { Pointer } from "./Pointer";
import { StringBuilder } from "./StringBuilder";

export class Divert extends ImpowerObject {
  get targetPath(): Path {
    if (this._targetPath != null && this._targetPath.isRelative) {
      const targetObj = this.targetPointer.Resolve();
      if (targetObj) {
        this._targetPath = targetObj.path;
      }
    }

    return this._targetPath;
  }

  set targetPath(value: Path) {
    this._targetPath = value;
    this._targetPointer = Pointer.Null;
  }

  public _targetPath: Path = null;

  get targetPointer(): Pointer {
    if (this._targetPointer.isNull) {
      const targetObj = this.ResolvePath(this._targetPath).obj;

      if (this._targetPath === null) {
        throw new NullException("this._targetPath");
      }
      if (this._targetPath.lastComponent === null) {
        throw new NullException("this._targetPath.lastComponent");
      }

      if (this._targetPath.lastComponent.isIndex) {
        if (targetObj === null) {
          throw new NullException("targetObj");
        }
        this._targetPointer.container =
          targetObj.parent instanceof Container ? targetObj.parent : null;
        this._targetPointer.index = this._targetPath.lastComponent.index;
      } else {
        this._targetPointer = Pointer.StartOf(
          targetObj instanceof Container ? targetObj : null
        );
      }
    }

    return this._targetPointer.copy();
  }

  public _targetPointer: Pointer = Pointer.Null;

  get targetPathString(): string {
    if (this.targetPath == null) return null;

    return this.CompactPathString(this.targetPath);
  }

  set targetPathString(value: string) {
    if (value == null) {
      this.targetPath = null;
    } else {
      this.targetPath = new Path(value);
    }
  }

  public variableDivertName: string = null;

  get hasVariableTarget(): boolean {
    return this.variableDivertName != null;
  }

  public pushesToStack = false;

  public stackPushType: PushPopType;

  public isExternal = false;

  public externalArgs = 0;

  public isConditional = false;

  constructor(stackPushType?: PushPopType) {
    super();
    this.pushesToStack = false;

    if (typeof stackPushType !== "undefined") {
      this.pushesToStack = true;
      this.stackPushType = stackPushType;
    }
  }

  public Equals(obj: Divert): boolean {
    const otherDivert = obj;
    if (otherDivert instanceof Divert) {
      if (this.hasVariableTarget === otherDivert.hasVariableTarget) {
        if (this.hasVariableTarget) {
          return this.variableDivertName === otherDivert.variableDivertName;
        }
        if (this.targetPath === null) {
          throw new NullException("this.targetPath");
        }
        return this.targetPath.Equals(otherDivert.targetPath);
      }
    }
    return false;
  }

  public toString(): string {
    if (this.hasVariableTarget) {
      return `Divert(variable: ${this.variableDivertName})`;
    }
    if (this.targetPath == null) {
      return "Divert(null)";
    }
    const sb = new StringBuilder();

    let targetStr = this.targetPath.toString();
    // int? targetLineNum = DebugLineNumberOfPath (targetPath);
    const targetLineNum = null;
    if (targetLineNum != null) {
      targetStr = `line ${targetLineNum}`;
    }

    sb.Append("Divert");

    if (this.isConditional) sb.Append("?");

    if (this.pushesToStack) {
      if (this.stackPushType === "Function") {
        sb.Append(" function");
      } else {
        sb.Append(" tunnel");
      }
    }

    sb.Append(" -> ");
    sb.Append(this.targetPathString);

    sb.Append(" (");
    sb.Append(targetStr);
    sb.Append(")");

    return sb.toString();
  }
}
