import { Game } from "../../../../game/core/classes/Game";
import { CommandData } from "../../../../game/logic/types/CommandData";
import { CommandRunner } from "../CommandRunner";

export class EndCommandRunner<G extends Game> extends CommandRunner<
  G,
  CommandData
> {
  override onExecute() {
    return [];
  }
}
