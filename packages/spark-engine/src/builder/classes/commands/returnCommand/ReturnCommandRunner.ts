import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { ReturnCommandData } from "./ReturnCommandData";

export class ReturnCommandRunner<G extends Game> extends CommandRunner<
  G,
  ReturnCommandData
> {
  override onExecute(data: ReturnCommandData): number[] {
    const { value } = data.params;

    const returnValue = this.game.logic.evaluate(value);

    this.game.logic.returnFromBlock(data.parent, returnValue);

    return super.onExecute(data);
  }
}
