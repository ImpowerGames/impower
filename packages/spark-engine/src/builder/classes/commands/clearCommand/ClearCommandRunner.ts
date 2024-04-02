import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { ClearCommandData } from "./ClearCommandData";

export class ClearCommandRunner<G extends Game> extends CommandRunner<
  G,
  ClearCommandData
> {
  override onExecute(data: ClearCommandData) {
    this.game.module.ui.text.clearAllContent();
    this.game.module.ui.image.clearAllContent();
    return super.onExecute(data);
  }
}
