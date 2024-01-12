import { Game } from "../../../../game/core/classes/Game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";
import { LogCommandData } from "./LogCommandData";

export class LogCommandRunner<G extends Game> extends CommandRunner<
  G,
  LogCommandData
> {
  override onExecute(data: LogCommandData, context: CommandContext): number[] {
    const { severity, message } = data.params;
    if (severity === undefined) {
      return super.onExecute(data, context);
    }
    if (message === undefined) {
      return super.onExecute(data, context);
    }
    this.game.debug.log({
      id: this.game.uuid.generate(),
      time: new Date().getTime(),
      severity,
      message,
    });
    return super.onExecute(data, context);
  }
}
