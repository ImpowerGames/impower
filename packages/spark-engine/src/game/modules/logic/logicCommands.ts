import type { Game } from "../../core/classes/Game";
import { BranchCommandRunner } from "../../modules/logic/classes/commands/branchCommand/BranchCommandRunner";
import { EndCommandRunner } from "../../modules/logic/classes/commands/endCommand/EndCommandRunner";
import { EvaluateCommandRunner } from "../../modules/logic/classes/commands/evaluateCommand/EvaluateCommandRunner";
import { JumpCommandRunner } from "../../modules/logic/classes/commands/jumpCommand/JumpCommandRunner";
import { LogCommandRunner } from "../../modules/logic/classes/commands/logCommand/LogCommandRunner";
import { ReturnCommandRunner } from "../../modules/logic/classes/commands/returnCommand/ReturnCommandRunner";
import { WaitCommandRunner } from "../../modules/logic/classes/commands/waitCommand/WaitCommandRunner";

export const logicCommands = (game: Game) => ({
  LogCommand: new LogCommandRunner(game),
  JumpCommand: new JumpCommandRunner(game),
  ReturnCommand: new ReturnCommandRunner(game),
  EndCommand: new EndCommandRunner(game),
  WaitCommand: new WaitCommandRunner(game),
  BranchCommand: new BranchCommandRunner(game),
  EvaluateCommand: new EvaluateCommandRunner(game),
});
