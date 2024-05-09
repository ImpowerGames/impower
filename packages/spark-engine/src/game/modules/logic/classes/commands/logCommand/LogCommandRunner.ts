import type { Game } from "../../../../../core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { LogCommandData } from "./LogCommandData";

export class LogCommandRunner<G extends Game> extends CommandRunner<
  G,
  LogCommandData
> {
  override onExecute(data: LogCommandData) {
    const { severity, message } = data.params;
    if (severity === undefined) {
      return super.onExecute(data);
    }
    if (message === undefined) {
      return super.onExecute(data);
    }
    this.game.module.debug.log({
      id: this.game.context.system.uuid(),
      time: new Date().getTime(),
      severity,
      message,
    });
    return super.onExecute(data);
  }
}
