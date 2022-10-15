import { getScopedValueContext } from "../../../../sparkdown";
import { CommandData } from "../../data";
import { SparkGame } from "../../game";
import { CommandRunner, SparkGameRunner } from "../../runner";

interface CommandRuntimeData {
  runner: CommandRunner;
  data: CommandData;
}

export class SparkContext {
  private _game: SparkGame;

  public get game(): SparkGame {
    return this._game;
  }

  private _runner: SparkGameRunner;

  public get runner(): SparkGameRunner {
    return this._runner;
  }

  private _editable: boolean;

  public get editable(): boolean {
    return this._editable;
  }

  public get loadedBlockIds(): string[] {
    return this.game.logic.state.loadedBlockIds;
  }

  private _contexts: {
    [id: string]: {
      ids: Record<string, string>;
      valueMap: Record<string, unknown>;
      objectMap: Record<string, Record<string, unknown>>;
      triggers: string[];
      parameters: string[];
      commands: CommandRuntimeData[];
    };
  } = {};

  public get contexts(): {
    [id: string]: {
      ids: Record<string, string>;
      valueMap: Record<string, unknown>;
      objectMap: Record<string, Record<string, unknown>>;
      triggers: string[];
      parameters: string[];
      commands: CommandRuntimeData[];
    };
  } {
    return this._contexts;
  }

  constructor(game: SparkGame, runner?: SparkGameRunner, editable?: boolean) {
    this._game = game;
    this._runner = runner || new SparkGameRunner();
    this._editable = editable || false;
    Object.entries(game.logic.blockMap).forEach(([blockId, block]) => {
      const [ids, valueMap] = getScopedValueContext(
        blockId,
        game?.logic?.blockMap
      );
      const objectMap = game?.struct?.objectMap;
      this._contexts[blockId] = {
        ids,
        valueMap,
        objectMap,
        triggers: block.triggers || [],
        parameters:
          Object.values(
            (block.variables as Record<
              string,
              { name: string; parameter?: boolean }
            >) || {}
          )
            .filter((v) => v.parameter)
            .map((p) => p.name) || [],
        commands: this.runner.getRuntimeData(
          block.commands as Record<string, CommandData>
        ),
      };
    });
    Object.values(this.runner.commandRunners || {}).forEach((r) => {
      r.init();
    });
  }

  init(): void {
    this.game.init();
  }

  async start(): Promise<void> {
    await this.game.start();
  }

  end(): void {
    this.game.destroy();
  }

  update(blockId: string, time: number, delta: number): boolean {
    const blockStates = this.game.logic.state?.blockStates;
    const variableStates = this.game.logic.state?.variableStates;
    const blockState = blockStates[blockId];
    const context = this.contexts[blockId];
    this.game.logic.state.changedVariables.forEach((id) => {
      const state = variableStates[id];
      context.valueMap[state.name] = state.value;
    });
    this.game.logic.state.changedBlocks.forEach((id) => {
      const state = blockStates[id];
      context.valueMap[state.name] = state.executionCount;
    });
    if (blockState.loaded) {
      const running = this.runner.blockRunners.Block.update(
        blockId,
        blockState,
        context,
        this.game,
        time,
        delta
      );
      if (running === null) {
        return false;
      }
    }
    return true;
  }
}
