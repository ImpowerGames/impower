import { Game } from "../../../../game/core/classes/Game";
import { CommandRunner } from "../CommandRunner";
import { JumpCommandData } from "./JumpCommandData";

export class JumpCommandRunner<G extends Game> extends CommandRunner<
  G,
  JumpCommandData
> {
  protected _targetId?: string | null;

  override onExecute(data: JumpCommandData) {
    const { value, returnWhenFinished } = data.params;

    if (!value) {
      return super.onExecute(data);
    }

    const newBlockId = this.game.logic.evaluateBlockId(data.parent, value);

    this._targetId = newBlockId;

    if (!newBlockId) {
      return super.onExecute(data);
    }

    this.game.logic.jumpToBlock(
      data.parent,
      data.index,
      newBlockId,
      returnWhenFinished
    );

    return super.onExecute(data);
  }

  override isFinished(data: JumpCommandData) {
    const { returnWhenFinished } = data.params;
    if (this._targetId != null && returnWhenFinished) {
      const blockState = this.game.logic.state.blocks?.[this._targetId];
      return Boolean(blockState?.isFinished);
    }
    return super.isFinished(data);
  }
}
