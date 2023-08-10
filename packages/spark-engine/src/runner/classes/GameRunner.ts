import { Game } from "../../game";
import { InstanceRunner } from "../../project/classes/instance/InstanceRunner";
import { BlockRunner } from "../../project/classes/instances/containers/block/BlockRunner";
import { CommandRunner } from "../../project/classes/instances/items/command/CommandRunner";
import { ConditionCommandRunner } from "../../project/classes/instances/items/commands/conditional/conditionCommand/ConditionCommandRunner";
import { AssignCommandRunner } from "../../project/classes/instances/items/commands/data/assignCommand/AssignCommandRunner";
import { EndCommandRunner } from "../../project/classes/instances/items/commands/flow/endCommand/EndCommandRunner";
import { EnterCommandRunner } from "../../project/classes/instances/items/commands/flow/enterCommand/EnterCommandRunner";
import { LogCommandRunner } from "../../project/classes/instances/items/commands/flow/logCommand/LogCommandRunner";
import { RepeatCommandRunner } from "../../project/classes/instances/items/commands/flow/repeatCommand/RepeatCommandRunner";
import { ReturnCommandRunner } from "../../project/classes/instances/items/commands/flow/returnCommand/ReturnCommandRunner";
import { WaitCommandRunner } from "../../project/classes/instances/items/commands/flow/waitCommand/WaitCommandRunner";

export class GameRunner<G extends Game> {
  protected _blockRunner: BlockRunner<G> = new BlockRunner();
  public get blockRunner(): BlockRunner<G> {
    return this._blockRunner;
  }

  protected _commandRunners: Record<string, CommandRunner<G>> = {
    LogCommand: new LogCommandRunner(),
    EnterCommand: new EnterCommandRunner(),
    ReturnCommand: new ReturnCommandRunner(),
    RepeatCommand: new RepeatCommandRunner(),
    EndCommand: new EndCommandRunner(),
    WaitCommand: new WaitCommandRunner(),
    ConditionCommand: new ConditionCommandRunner(),
    AssignCommand: new AssignCommandRunner(),
  };
  protected _commandRunnersArray?: CommandRunner<G>[];
  public get commandRunners(): readonly CommandRunner<G>[] {
    if (!this._commandRunnersArray) {
      this._commandRunnersArray = Object.values(this._commandRunners);
    }
    return this._commandRunnersArray;
  }

  registerBlockRunner(_refTypeId: string, inspector: BlockRunner<G>): void {
    this._blockRunner = inspector;
  }

  registerCommandRunner(refTypeId: string, inspector: CommandRunner<G>): void {
    this._commandRunners[refTypeId] = inspector;
    this._commandRunnersArray = Object.values(this._commandRunners);
  }

  getBlockRunner(): InstanceRunner<G> {
    return this._blockRunner || new BlockRunner();
  }

  getCommandRunner(typeId: string): InstanceRunner<G> {
    return this._commandRunners[typeId] || new CommandRunner();
  }
}
