import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { ClearCommandData } from "./ClearCommandData";

export class ClearCommandRunner<G extends Game> extends CommandRunner<
  G,
  ClearCommandData
> {
  override onExecute(data: ClearCommandData) {
    this.game.ui.text.clearAll("display");
    this.game.ui.image.clearAll("display");
    return super.onExecute(data);
  }
}
