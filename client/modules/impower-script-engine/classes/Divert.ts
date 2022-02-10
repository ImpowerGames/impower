import { PushPopType } from "../types/PushPopType";
import { Container } from "./Container";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { Pointer } from "./Pointer";
import { RuntimeObject } from "./RuntimeObject";
import { StringBuilder } from "./StringBuilder";

export class Divert extends RuntimeObject {
  public _targetPath: Path = null;

  public _targetPointer: Pointer = Pointer.Null;

  public variableDivertName: string = null;

  public pushesToStack = false;

  public stackPushType: PushPopType;

  public isExternal = false;

  public externalArgs = 0;

  public isConditional = false;

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

    return this._targetPointer.Copy();
  }

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

  get hasVariableTarget(): boolean {
    return this.variableDivertName != null;
  }

  constructor(stackPushType?: PushPopType) {
    super();
    this.pushesToStack = false;

    if (typeof stackPushType !== "undefined") {
      this.pushesToStack = true;
      this.stackPushType = stackPushType;
    }
  }

  override Copy(): Divert {
    const obj = new Divert();
    obj._targetPath = this._targetPath.Copy();
    obj._targetPointer = this._targetPointer.Copy();
    obj.variableDivertName = this.variableDivertName;
    obj.pushesToStack = this.pushesToStack;
    obj.stackPushType = this.stackPushType;
    obj.isExternal = this.isExternal;
    obj.externalArgs = this.externalArgs;
    obj.isConditional = this.isConditional;
    return obj;
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

    return sb.ToString();
  }
}
