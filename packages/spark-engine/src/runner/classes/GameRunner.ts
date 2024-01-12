import { Game } from "../../game";
import { CommandRunner } from "../../project/command/CommandRunner";
import { BranchCommandRunner } from "../../project/commands/branchCommand/BranchCommandRunner";
import { EndCommandRunner } from "../../project/commands/endCommand/EndCommandRunner";
import { EvaluateCommandRunner } from "../../project/commands/evaluateCommand/EvaluateCommandRunner";
import { JumpCommandRunner } from "../../project/commands/jumpCommand/JumpCommandRunner";
import { LogCommandRunner } from "../../project/commands/logCommand/LogCommandRunner";
import { ReturnCommandRunner } from "../../project/commands/returnCommand/ReturnCommandRunner";
import { WaitCommandRunner } from "../../project/commands/waitCommand/WaitCommandRunner";

export class GameRunner<G extends Game> {
  private _game: G;
  get game() {
    return this._game;
  }

  protected _commandRunnerMap: Record<string, CommandRunner<G>>;
  protected _commandRunnerArray: CommandRunner<G>[];
  get commandRunners() {
    return this._commandRunnerArray;
  }

  constructor(game: G, commandRunners?: Record<string, CommandRunner<G>>) {
    this._game = game;
    this._commandRunnerMap = {
      LogCommand: new LogCommandRunner(game),
      JumpCommand: new JumpCommandRunner(game),
      ReturnCommand: new ReturnCommandRunner(game),
      EndCommand: new EndCommandRunner(game),
      WaitCommand: new WaitCommandRunner(game),
      BranchCommand: new BranchCommandRunner(game),
      EvaluateCommand: new EvaluateCommandRunner(game),
      ...(commandRunners || {}),
    };
    this._commandRunnerArray = Object.values(this._commandRunnerMap);
  }

  registerCommandRunner(refTypeId: string, runner: CommandRunner<G>) {
    this._commandRunnerMap[refTypeId] = runner;
    this._commandRunnerArray = Object.values(this._commandRunnerMap);
  }

  getCommandRunner(typeId: string) {
    return this._commandRunnerMap[typeId] || new CommandRunner(this.game);
  }
}
