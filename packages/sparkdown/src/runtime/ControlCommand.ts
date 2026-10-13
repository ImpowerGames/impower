import { InkObject } from "./Object";

export class ControlCommand extends InkObject {
  private _commandType: ControlCommand.CommandType;

  get commandType(): ControlCommand.CommandType {
    return this._commandType;
  }

  constructor(commandType: ControlCommand.CommandType) {
    super();
    this._commandType = commandType;
  }

  public override Copy() {
    return new ControlCommand(this.commandType);
  }
  public static BeginString() {
    return new ControlCommand(ControlCommand.CommandType.BeginString);
  }
  public static BeginTag() {
    return new ControlCommand(ControlCommand.CommandType.BeginTag);
  }
  public static EndTag() {
    return new ControlCommand(ControlCommand.CommandType.EndTag);
  }
  public static BeginScope() {
    return new ControlCommand(ControlCommand.CommandType.BeginScope);
  }
  public static EndScope() {
    return new ControlCommand(ControlCommand.CommandType.EndScope);
  }
  public override toString() {
    return "ControlCommand " + this.commandType.toString();
  }
}

export namespace ControlCommand {
  export enum CommandType {
    // The program engine pushes these onto the output stream: `BeginString`
    // opens a string evaluation (an interpolation or a choice's text) and
    // `BeginTag` / `EndTag` bracket a tag's text. The state reads them back
    // when it builds the current text and tags, and a save writes them.
    BeginString,
    BeginTag,
    EndTag,

    // Push / pop a temporary-variable scope frame. The lowerers wrap block
    // bodies (`if`/`for`/`while`/`repeat`/`do`) in these so `local x`
    // declarations follow Luau's block-scoping rules, and the program writer
    // reads them as the bounds of a block's scope.
    BeginScope,
    EndScope,

    TOTAL_VALUES,
  }
}
