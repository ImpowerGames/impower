import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { ReturnCommandData } from "./ReturnCommandData";

export class ReturnCommandRunner<G extends Game> extends CommandRunner<
  G,
  ReturnCommandData
> {
  override onExecute(data: ReturnCommandData) {
    const { value } = data.params;

    const returnValue = this.game.module.logic.evaluate(value);

    this.game.module.logic.returnFromBlock(data.parent, returnValue);

    return super.onExecute(data);
  }
}
