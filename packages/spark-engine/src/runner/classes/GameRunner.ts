import { Game } from "../../game";
import { BlockRunner } from "../../project/classes/instances/containers/block/BlockRunner";
import { CommandRunner } from "../../project/classes/instances/items/command/CommandRunner";
import { BranchCommandRunner } from "../../project/classes/instances/items/commands/branchCommand/BranchCommandRunner";
import { EndCommandRunner } from "../../project/classes/instances/items/commands/endCommand/EndCommandRunner";
import { EvaluateCommandRunner } from "../../project/classes/instances/items/commands/evaluateCommand/EvaluateCommandRunner";
import { JumpCommandRunner } from "../../project/classes/instances/items/commands/jumpCommand/JumpCommandRunner";
import { LogCommandRunner } from "../../project/classes/instances/items/commands/logCommand/LogCommandRunner";
import { ReturnCommandRunner } from "../../project/classes/instances/items/commands/returnCommand/ReturnCommandRunner";
import { WaitCommandRunner } from "../../project/classes/instances/items/commands/waitCommand/WaitCommandRunner";

export class GameRunner<G extends Game> {
  protected _blockRunner: BlockRunner<G> = new BlockRunner();
  public get blockRunner(): BlockRunner<G> {
    return this._blockRunner;
  }

  protected _commandRunners: Record<string, CommandRunner<G>> = {
    LogCommand: new LogCommandRunner(),
    JumpCommand: new JumpCommandRunner(),
    ReturnCommand: new ReturnCommandRunner(),
    EndCommand: new EndCommandRunner(),
    WaitCommand: new WaitCommandRunner(),
    BranchCommand: new BranchCommandRunner(),
    EvaluateCommand: new EvaluateCommandRunner(),
  };
  protected _commandRunnersArray?: CommandRunner<G>[];
  public get commandRunners(): readonly CommandRunner<G>[] {
    if (!this._commandRunnersArray) {
      this._commandRunnersArray = Object.values(this._commandRunners);
    }
    return this._commandRunnersArray;
  }

  registerBlockRunner(_refTypeId: string, inspector: BlockRunner<G>) {
    this._blockRunner = inspector;
  }

  registerCommandRunner(refTypeId: string, inspector: CommandRunner<G>) {
    this._commandRunners[refTypeId] = inspector;
    this._commandRunnersArray = Object.values(this._commandRunners);
  }

  getBlockRunner() {
    return this._blockRunner || new BlockRunner();
  }

  getCommandRunner(typeId: string) {
    return this._commandRunners[typeId] || new CommandRunner();
  }
}
