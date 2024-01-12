import { Game } from "../../../game/core/classes/Game";
import { CommandRunner } from "../../command/CommandRunner";
import { JumpCommandData } from "./JumpCommandData";

export class JumpCommandRunner<G extends Game> extends CommandRunner<
  G,
  JumpCommandData
> {
  protected _targetId?: string | null;

  override onExecute(data: JumpCommandData): number[] {
    const { value, returnWhenFinished } = data.params;
    const currentBlockId = data.reference.parentId;

    if (!value) {
      return super.onExecute(data);
    }

    const newBlockId = this.game.logic.evaluateBlockId(currentBlockId, value);

    this._targetId = newBlockId;

    if (!newBlockId) {
      return super.onExecute(data);
    }

    this.game.logic.jumpToBlock(currentBlockId, newBlockId, returnWhenFinished);

    return super.onExecute(data);
  }

  override isFinished(data: JumpCommandData): boolean | null {
    const { returnWhenFinished } = data.params;
    if (this._targetId != null && returnWhenFinished) {
      const blockState = this.game.logic.state.blockStates[this._targetId];
      return Boolean(blockState?.hasFinished);
    }
    return super.isFinished(data);
  }
}
