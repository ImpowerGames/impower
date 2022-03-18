import { BlockData, CommandData } from "../../../../../data";
import { BlockState, ImpowerGame } from "../../../../../game";
import { ContainerRunner } from "../../container/containerRunner";
import { CommandRunner } from "../../items/command/commandRunner";

export interface BlockContext {
  ids: Record<string, string>;
  valueMap: Record<string, string | number | boolean>;
  variables: Record<string, string | number | boolean>;
  assets: Record<string, string>;
  entities: Record<string, string>;
  tags: Record<string, string>;
  blocks: Record<string, number>;
  triggers: string[];
  parameters: string[];
  commands: {
    runner: CommandRunner;
    data: CommandData;
    level: number;
  }[];
}

export class BlockRunner extends ContainerRunner<BlockData> {
  private static _instance: BlockRunner;

  public static get instance(): BlockRunner {
    if (!this._instance) {
      this._instance = new BlockRunner();
    }
    return this._instance;
  }

  triggerDependencies: Record<string, string | number | boolean> = {};

  /**
   * Iterates over triggers performs their initializers.
   *
   */
  init(context: BlockContext, game: ImpowerGame): void {
    const { variables, commands, triggers } = context;
    triggers.forEach((variableName) => {
      const value = variables[variableName];
      this.triggerDependencies[variableName] = value;
    });
    commands.forEach((command) => {
      command.runner.init(command.data, { ...context, index: -1 }, game);
    });
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
    const { triggers, variables } = context;

    game.logic.updateBlock({ id, time, delta });

    if (!blockState.isExecuting) {
      let shouldExecute = false;
      const satisfiedTriggers: string[] = [];
      const unsatisfiedTriggers: string[] = [];
      triggers.forEach((variableName) => {
        const value = variables[variableName];
        if (this.triggerDependencies[variableName] !== value) {
          this.triggerDependencies[variableName] = value;
          satisfiedTriggers.push(variableName);
          shouldExecute = true;
        } else {
          unsatisfiedTriggers.push(variableName);
        }
      });

      game.logic.checkTriggers({
        blockId: id,
        shouldExecute,
        satisfiedTriggers,
        unsatisfiedTriggers,
      });

      if (shouldExecute) {
        game.logic.executeBlock({
          id,
          executedByBlockId: "",
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
    const { commands } = context;
    const blockId = id;
    while (blockState.executingIndex < commands.length) {
      const command = commands[blockState.executingIndex];
      const commandId = command.data.reference.refId;
      const commandIndex = blockState.executingIndex;
      const pos = command?.data?.pos;
      const line = command?.data?.line;
      const fastForward = blockState.startIndex > blockState.executingIndex;
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
        if (
          !fastForward ||
          !command.runner.isPure(
            command.data,
            { ...context, index: blockState.executingIndex },
            game
          )
        ) {
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
        const nextCommandIndex = blockState.commandJumpStack[0];
        game.logic.commandJumpStackPop({
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
