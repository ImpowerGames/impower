import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { ClearCommandData } from "./ClearCommandData";

export class ClearCommandRunner<G extends Game> extends CommandRunner<
  G,
  ClearCommandData
> {
  override onExecute(data: ClearCommandData) {
    this.game.module.ui.text.clearAll("display");
    this.game.module.ui.image.clearAll("display");
    return super.onExecute(data);
  }
}
