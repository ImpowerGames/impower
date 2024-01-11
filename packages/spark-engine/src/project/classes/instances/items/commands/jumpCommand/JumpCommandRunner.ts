import { JumpCommandData } from "../../../../../../data";
import { Game } from "../../../../../../game";
import { CommandContext, CommandRunner } from "../../command/CommandRunner";

export class JumpCommandRunner<G extends Game> extends CommandRunner<
  G,
  JumpCommandData
> {
  protected _targetId?: string | null;

  override onExecute(data: JumpCommandData, context: CommandContext): number[] {
    const { value, returnWhenFinished } = data.params;
    const currentBlockId = data.reference.parentId;

    if (!value) {
      return super.onExecute(data, context);
    }

    const newBlockId = this.game.logic.evaluateBlockId(currentBlockId, value);

    this._targetId = newBlockId;

    if (!newBlockId) {
      return super.onExecute(data, context);
    }

    this.game.logic.jumpToBlock(currentBlockId, newBlockId, returnWhenFinished);

    return super.onExecute(data, context);
  }

  override isFinished(
    data: JumpCommandData,
    context: CommandContext
  ): boolean | null {
    const { returnWhenFinished } = data.params;
    if (this._targetId != null && returnWhenFinished) {
      const blockState = this.game.logic.state.blockStates[this._targetId];
      return Boolean(blockState?.hasFinished);
    }
    return super.isFinished(data, context);
  }
}
