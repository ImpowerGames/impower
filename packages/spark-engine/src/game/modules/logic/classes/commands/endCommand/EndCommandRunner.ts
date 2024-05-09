import type { Game } from "../../../../../core/classes/Game";
import type { CommandData } from "../../../types/CommandData";
import { CommandRunner } from "../CommandRunner";

export class EndCommandRunner<G extends Game> extends CommandRunner<
  G,
  CommandData
> {
  override onExecute() {
    return [];
  }
}
