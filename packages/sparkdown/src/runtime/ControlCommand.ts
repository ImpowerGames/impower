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
    BeginString,
    BeginTag,
    EndTag,

    BeginScope,
    EndScope,

    TOTAL_VALUES,
  }
}
