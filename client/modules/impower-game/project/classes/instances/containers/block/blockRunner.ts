import { BlockData, CommandData } from "../../../../../data";
import { BlockState, ImpowerGame } from "../../../../../game";
import { ContainerRunner } from "../../container/containerRunner";
import { CommandRunner } from "../../items/command/commandRunner";

export interface BlockContext {
  ids: Record<string, string>;
  valueMap: Record<string, unknown>;
  triggers: string[];
  parameters: string[];
  commands: {
    runner: CommandRunner;
    data: CommandData;
  }[];
  debug?: boolean;
}

export class BlockRunner extends ContainerRunner<BlockData> {
  private static _instance: BlockRunner;

  public static get instance(): BlockRunner {
    if (!this._instance) {
      this._instance = new BlockRunner();
    }
    return this._instance;
  }

  /**
   * This method is called once per game step while the scene is running.
   * @param time The current time. Either a High Resolution Timer value if it comes from Request Animation Frame, or Date.now if using SetTimeout.
   * @param delta The delta time in ms since the last frame. This is a smoothed and capped value based on the FPS rate.
   */
  update(
    id: string,
    blockState: BlockState,
    context: BlockContext,
    game: ImpowerGame,
    time: number,
    delta: number
  ): void {
    const { triggers, valueMap } = context;

    game.logic.updateBlock({ id, time, delta });

    if (!blockState.isExecuting) {
      const satisfiedTriggers: string[] = [];
      const unsatisfiedTriggers: string[] = [];
      triggers.forEach((variableName) => {
        const value = valueMap[variableName];
        if (value) {
          satisfiedTriggers.push(variableName);
        } else {
          unsatisfiedTriggers.push(variableName);
        }
      });

      const shouldExecute = satisfiedTriggers?.length > 0;

      game.logic.checkTriggers({
        blockId: id,
        shouldExecute,
        satisfiedTriggers,
        unsatisfiedTriggers,
      });

      if (shouldExecute) {
        game.logic.executeBlock({
          id,
          executedByBlockId: game.logic.blockTree[id].parent,
        });
      }
    }

    if (blockState.isExecuting) {
      if (this.runCommands(id, blockState, context, game, time)) {
        game.logic.finishBlock({ id });
        game.logic.continue({ id });
      }
    }
  }

  /**
   * Iterates over commands and executes each one in sequence.
   *
   * @return {boolean} True, if the block is finished executing and there are no more commands left to execute. Otherwise, false.
   */
  private runCommands(
    id: string,
    blockState: BlockState,
    context: BlockContext,
    game: ImpowerGame,
    time: number
  ): boolean {
    const commands = context?.commands;
    const blockId = id;
    while (blockState.executingIndex < commands.length) {
      const command = commands[blockState.executingIndex];
      const commandId = command.data.reference.refId;
      const commandIndex = blockState.executingIndex;
      const executionCount = blockState.commandExecutionCounts[commandId];
      const pos = command?.data?.pos;
      const line = command?.data?.line;
      const fastForward = blockState.startIndex > blockState.executingIndex;
      const variableStates = game?.logic?.state?.variableStates;
      const blockStates = game?.logic?.state?.blockStates;
      Object.entries(variableStates).forEach(([id, state]) => {
        const name = id.split(".").slice(-1).join("");
        context.valueMap[name] = state.value;
      });
      Object.entries(blockStates).forEach(([id, state]) => {
        const name = id.split(".").slice(-1).join("");
        context.valueMap[name] = state.executionCount;
      });
      context.valueMap["#"] = [
        executionCount,
        game.random.state.seed + commandId,
      ];
      context.debug = game?.debug?.state?.debugging;
      if (blockState.lastExecutedAt < 0) {
        game.logic.executeCommand({
          pos,
          line,
          blockId,
          commandId,
          commandIndex,
          time,
        });
        let nextJumps: number[] = [];
        if (!fastForward) {
          nextJumps = command.runner.onExecute(
            command.data,
            { ...context, index: blockState.executingIndex },
            game
          );
        }
        if (nextJumps.length > 0) {
          game.logic.commandJumpStackPush({
            pos,
            line,
            blockId,
            indices: nextJumps,
          });
        }
        if (blockState.lastExecutedAt < 0) {
          return false;
        }
      }
      if (
        !fastForward &&
        command.data.waitUntilFinished &&
        !command.runner.isFinished(
          command.data,
          { ...context, index: blockState.executingIndex },
          game
        )
      ) {
        return false;
      }
      game.logic.finishCommand({
        pos,
        line,
        blockId,
        commandId,
        commandIndex,
        time,
      });
      if (blockState.commandJumpStack.length > 0) {
        const nextCommandIndex = game.logic.commandJumpStackPop({
          pos,
          line,
          blockId,
        });
        game.logic.goToCommandIndex({
          pos,
          line,
          blockId,
          index: nextCommandIndex,
        });
      } else {
        const nextCommandIndex = blockState.executingIndex + 1;
        game.logic.goToCommandIndex({
          pos,
          line,
          blockId,
          index: nextCommandIndex,
        });
      }
    }
    return true;
  }
}
