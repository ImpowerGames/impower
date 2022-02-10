import { CommandType } from "../types/CommandType";
import { RuntimeObject } from "./RuntimeObject";

export class ControlCommand extends RuntimeObject {
  private _commandType: CommandType;

  get commandType(): CommandType {
    return this._commandType;
  }

  constructor(commandType: CommandType = undefined) {
    super();
    this._commandType = commandType;
  }

  override Copy(): ControlCommand {
    return new ControlCommand(this.commandType);
  }

  public static EvalStart(): ControlCommand {
    return new ControlCommand("EvalStart");
  }

  public static EvalOutput(): ControlCommand {
    return new ControlCommand("EvalOutput");
  }

  public static EvalEnd(): ControlCommand {
    return new ControlCommand("EvalEnd");
  }

  public static Duplicate(): ControlCommand {
    return new ControlCommand("Duplicate");
  }

  public static PopEvaluatedValue(): ControlCommand {
    return new ControlCommand("PopEvaluatedValue");
  }

  public static PopFunction(): ControlCommand {
    return new ControlCommand("PopFunction");
  }

  public static PopTunnel(): ControlCommand {
    return new ControlCommand("PopTunnel");
  }

  public static BeginString(): ControlCommand {
    return new ControlCommand("BeginString");
  }

  public static EndString(): ControlCommand {
    return new ControlCommand("EndString");
  }

  public static NoOp(): ControlCommand {
    return new ControlCommand("NoOp");
  }

  public static ChoiceCount(): ControlCommand {
    return new ControlCommand("ChoiceCount");
  }

  public static Turns(): ControlCommand {
    return new ControlCommand("Turns");
  }

  public static TurnsSince(): ControlCommand {
    return new ControlCommand("TurnsSince");
  }

  public static ReadCount(): ControlCommand {
    return new ControlCommand("ReadCount");
  }

  public static Random(): ControlCommand {
    return new ControlCommand("Random");
  }

  public static SeedRandom(): ControlCommand {
    return new ControlCommand("SeedRandom");
  }

  public static VisitIndex(): ControlCommand {
    return new ControlCommand("VisitIndex");
  }

  public static SequenceShuffleIndex(): ControlCommand {
    return new ControlCommand("SequenceShuffleIndex");
  }

  public static StartThread(): ControlCommand {
    return new ControlCommand("StartThread");
  }

  public static Done(): ControlCommand {
    return new ControlCommand("Done");
  }

  public static End(): ControlCommand {
    return new ControlCommand("End");
  }

  public static ListFromInt(): ControlCommand {
    return new ControlCommand("ListFromInt");
  }

  public static ListRange(): ControlCommand {
    return new ControlCommand("ListRange");
  }

  public static ListRandom(): ControlCommand {
    return new ControlCommand("ListRandom");
  }

  public toString(): string {
    return this.commandType.toString();
  }
}
