import { CommandData } from "../../../../../../data";
import { Game } from "../../../../../../game";
import { CommandRunner } from "../../command/CommandRunner";

export class EndCommandRunner<G extends Game> extends CommandRunner<
  G,
  CommandData
> {
  override onExecute(): number[] {
    return [];
  }
}
