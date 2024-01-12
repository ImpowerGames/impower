import { Game } from "../../../game/core/classes/Game";
import { CommandData } from "../../command/CommandData";
import { CommandRunner } from "../../command/CommandRunner";

export class EndCommandRunner<G extends Game> extends CommandRunner<
  G,
  CommandData
> {
  override onExecute(): number[] {
    return [];
  }
}
