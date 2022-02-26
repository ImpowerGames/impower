import {
  BlockData,
  CommandData,
  InstanceData,
  TriggerData,
  VariableData,
} from "../../../../../data";
import { BlockState, ImpowerGame } from "../../../../../game";
import { ContainerRunner } from "../../container/containerRunner";
import { CommandRunner } from "../../items/command/commandRunner";
import { TriggerRunner } from "../../items/trigger/triggerRunner";

export class BlockRunner extends ContainerRunner<BlockData> {
  private static _instance: BlockRunner;

  public static get instance(): BlockRunner {
    if (!this._instance) {
      this._instance = new BlockRunner();
    }
    return this._instance;
  }

  /**
   * Iterates over triggers performs their initializers.
   *
   */
  init(
    triggers: {
      runner: TriggerRunner;
      data: TriggerData;
      level: number;
    }[],
    commands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[],
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): void {
    triggers.forEach((trigger) => {
      trigger.runner.init(trigger.data, variables, game);
    });
    commands.forEach((command) => {
      command.runner.init(command.data, variables, game);
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
    triggers: {
      runner: TriggerRunner;
      data: TriggerData;
      level: number;
    }[],
    commands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[],
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    time: number,
    delta: number
  ): void {
    game.logic.updateBlock({ id, time, delta });

    if (!blockState.isExecuting) {
      const { shouldExecute, satisfiedTriggers, unsatisfiedTriggers } =
        this.checkTriggers(triggers, variables, game);

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
      if (this.runCommands(id, blockState, commands, variables, game, time)) {
        game.logic.finishBlock({ id });
        game.logic.continueToNextBlock({ id });
      }
    }
  }

  /**
   * Iterates over triggers and checks if the block should be executed.
   *
   * @return {boolean} True if the block should be executed this frame. Otherwise, false.
   */
  private checkTriggers(
    triggers: {
      runner: TriggerRunner;
      data: TriggerData;
      level: number;
    }[],
    variables: { [refId: string]: VariableData },
    game: ImpowerGame
  ): {
    shouldExecute: boolean;
    satisfiedTriggers: string[];
    unsatisfiedTriggers: string[];
  } {
    const calculate = (t: boolean[], all: boolean): boolean => {
      if (all) {
        return t.every((x) => x);
      }
      return t.some((x) => x);
    };

    const satisfiedTriggers: string[] = [];
    const unsatisfiedTriggers: string[] = [];

    const array: boolean[][] = [[]];
    let level = 0;
    const checkAll: boolean[] = [];
    let group: InstanceData;
    triggers.forEach((trigger) => {
      if (trigger.runner.opensGroup(trigger.data)) {
        group = trigger.data;
        level += 1;
        array[level] = [];
        checkAll.push(trigger.runner.shouldCheckAllChildren(trigger.data));
        return;
      }
      if (trigger.runner.closesGroup(trigger.data, group)) {
        level -= 1;
        array[level].push(
          calculate(array[level + 1], checkAll[checkAll.length - 1])
        );
        checkAll.pop();
        return;
      }
      const satisfied = trigger.runner.shouldExecute(
        trigger.data,
        variables,
        game
      );
      const canExecute = trigger.runner.canExecute(
        trigger.data,
        variables,
        game
      );
      if (canExecute) {
        if (satisfied) {
          satisfiedTriggers.push(trigger.data.reference.refId);
        } else {
          unsatisfiedTriggers.push(trigger.data.reference.refId);
        }
      }
      array[level].push(canExecute && satisfied);
    });

    return {
      shouldExecute: calculate(array[0], false),
      satisfiedTriggers,
      unsatisfiedTriggers,
    };
  }

  /**
   * Iterates over commands and executes each one in sequence.
   *
   * @return {boolean} True, if the block is finished executing and there are no more commands left to execute. Otherwise, false.
   */
  private runCommands(
    id: string,
    blockState: BlockState,
    commands: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[],
    variables: { [refId: string]: VariableData },
    game: ImpowerGame,
    time: number
  ): boolean {
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
          !command.runner.isPure(command.data, variables, game)
        ) {
          nextJumps = command.runner.onExecute(
            command.data,
            variables,
            game,
            blockState.executingIndex,
            commands
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
        !command.runner.isFinished(command.data, variables, game)
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
