import {
  CommandData,
  CommandRunner,
  SparkGame,
  SparkGameRunner,
} from "../../..";
import { getScopedValueContext } from "../../../../sparkdown";

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

  constructor(game: SparkGame, runner?: SparkGameRunner) {
    this._game = game;
    this._runner = runner || new SparkGameRunner();
    Object.entries(game.logic.blockMap).forEach(([blockId, block]) => {
      const [ids, valueMap] = getScopedValueContext(
        blockId,
        game?.logic?.blockMap
      );
      const objectMap = game?.entity?.objectMap;
      this._contexts[blockId] = {
        ids,
        valueMap,
        objectMap,
        triggers: block.triggers,
        parameters: block.parameters,
        commands: this.runner.getRuntimeData(
          block.commands as Record<string, CommandData>
        ),
      };
    });
    Object.values(this.runner.commandRunners || {}).forEach((r) => {
      r.init();
    });
  }

  init() {
    this.game.init();
  }

  start() {
    this.game.start();
  }

  end() {
    this.game.end();
  }

  update(blockId: string, time: number, delta: number): boolean {
    const blockStates = this.game.logic.state?.blockStates;
    const variableStates = this.game.logic.state?.variableStates;
    const blockState = blockStates[blockId];
    const context = this.contexts[blockId];
    Object.entries(variableStates).forEach(([id, state]) => {
      const name = id.split(".").slice(-1).join("");
      context.valueMap[name] = state.value;
    });
    Object.entries(blockStates).forEach(([id, state]) => {
      const name = id.split(".").slice(-1).join("");
      context.valueMap[name] = state.executionCount;
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
