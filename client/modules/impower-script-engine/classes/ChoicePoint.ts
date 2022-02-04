import { Container } from "./Container";
import { ImpowerObject } from "./ImpowerObject";
import { NullException } from "./NullException";
import { Path } from "./Path";

export class ChoicePoint extends ImpowerObject {
  public _pathOnChoice: Path = null;

  public hasCondition = false;

  public hasStartContent = false;

  public hasChoiceOnlyContent = false;

  public isInvisibleDefault = false;

  public onceOnly = true;

  constructor(onceOnly = true) {
    super();
    this.onceOnly = onceOnly;
  }

  get pathOnChoice(): Path {
    if (this._pathOnChoice != null && this._pathOnChoice.isRelative) {
      const choiceTargetObj = this.choiceTarget;
      if (choiceTargetObj) {
        this._pathOnChoice = choiceTargetObj.path;
      }
    }
    return this._pathOnChoice;
  }

  set pathOnChoice(value: Path) {
    this._pathOnChoice = value;
  }

  get choiceTarget(): Container {
    if (this._pathOnChoice === null) {
      throw new NullException("ChoicePoint._pathOnChoice");
    }
    return this.ResolvePath(this._pathOnChoice).container;
  }

  get pathStringOnChoice(): string {
    if (this.pathOnChoice === null) {
      throw new NullException("ChoicePoint.pathOnChoice");
    }
    return this.CompactPathString(this.pathOnChoice);
  }

  set pathStringOnChoice(value: string) {
    this.pathOnChoice = new Path(value);
  }

  get flags(): number {
    let flags = 0;
    if (this.hasCondition) flags |= 1;
    if (this.hasStartContent) flags |= 2;
    if (this.hasChoiceOnlyContent) flags |= 4;
    if (this.isInvisibleDefault) flags |= 8;
    if (this.onceOnly) flags |= 16;
    return flags;
  }

  set flags(value: number) {
    this.hasCondition = (value & 1) > 0;
    this.hasStartContent = (value & 2) > 0;
    this.hasChoiceOnlyContent = (value & 4) > 0;
    this.isInvisibleDefault = (value & 8) > 0;
    this.onceOnly = (value & 16) > 0;
  }

  public toString(): string {
    if (this.pathOnChoice === null) {
      throw new NullException("ChoicePoint.pathOnChoice");
    }
    // int? targetLineNum = DebugLineNumberOfPath (pathOnChoice);
    const targetLineNum = null;
    let targetString = this.pathOnChoice.toString();

    if (targetLineNum != null) {
      targetString = ` line ${targetLineNum}(${targetString})`;
    }

    return `Choice: -> ${targetString}`;
  }
}
