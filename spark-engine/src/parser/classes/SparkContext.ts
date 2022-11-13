import {
  getScopedValueContext,
  getSectionAtLine,
  SparkParseResult,
} from "../../../../sparkdown";
import { CommandData } from "../../data";
import { Block, CameraState, SparkGame } from "../../game";
import { CommandRunner, SparkGameRunner } from "../../runner";
import { SparkContextConfig } from "../interfaces/SparkContextConfig";
import { generateSectionBlocks } from "../utils/generateSectionBlocks";
import { generateStructObjects } from "../utils/generateStructObjects";

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

  public get loadedBlockIds(): readonly string[] {
    return this.game.logic.state.loadedBlockIds;
  }

  private _contexts: {
    [id: string]: {
      ids: Record<string, string>;
      valueMap: Record<string, unknown>;
      objectMap: Record<string, Record<string, unknown>>;
      triggers: string[];
      parameters: string[];
      commands: {
        runner: CommandRunner;
        data: CommandData;
      }[];
    };
  } = {};

  public get contexts(): {
    [id: string]: {
      ids: Record<string, string>;
      valueMap: Record<string, unknown>;
      objectMap: Record<string, Record<string, unknown>>;
      triggers: string[];
      parameters: string[];
      commands: {
        runner: CommandRunner;
        data: CommandData;
      }[];
    };
  } {
    return this._contexts;
  }

  constructor(parsed: SparkParseResult, config?: SparkContextConfig) {
    const activeLine = config?.activeLine || 0;
    const editable = config?.editable || false;
    const runner = config?.runner || new SparkGameRunner();
    const blockMap = generateSectionBlocks(parsed?.sections || {});
    const objectMap = generateStructObjects(parsed?.structs || {});
    const defaultCameras = objectMap["camera"] as Record<string, CameraState>;
    const [startBlockId] = getSectionAtLine(activeLine, parsed?.sections || {});
    const startRuntimeBlock = blockMap?.[startBlockId];
    let startCommandIndex = 0;
    const startCommands = Object.values(startRuntimeBlock?.commands || {});
    for (let i = 1; i < startCommands?.length || 0; i += 1) {
      const command = startCommands[i];
      if (command && command.check !== "close" && command.line > activeLine) {
        break;
      } else {
        startCommandIndex = i;
      }
    }
    const game = new SparkGame(
      {
        logic: { blockMap },
        struct: { objectMap },
        world: { defaultCameras },
      },
      {
        ...(config?.state || {}),
        logic: {
          ...(config?.state?.logic || {}),
          activeParentBlockId: startBlockId,
          activeCommandIndex: startCommandIndex,
        },
      }
    );
    this._game = game;
    this._runner = runner;
    this._editable = editable || false;
    Object.entries(game?.logic?.config?.blockMap).forEach(
      ([blockId, block]) => {
        const [ids, valueMap] = getScopedValueContext(
          blockId,
          game?.logic?.config?.blockMap as Record<string, Block>
        );
        const objectMap = game?.struct?.config?.objectMap;
        this._contexts[blockId] = {
          ids,
          valueMap,
          objectMap,
          triggers: [...(block.triggers || [])],
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
      }
    );
    this.runner.commandRunners.forEach((r) => {
      r.init(game);
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

  update(timeMS: number, deltaMS: number): boolean {
    this.game.ticker.tick(timeMS, deltaMS);
    this.runner.commandRunners.forEach((r) => {
      r.onUpdate(timeMS, deltaMS, this.game);
    });
    if (this.loadedBlockIds) {
      for (let i = 0; i < this.loadedBlockIds.length; i += 1) {
        const blockId = this.loadedBlockIds[i];
        if (blockId !== undefined) {
          if (!this.updateBlock(blockId, timeMS, deltaMS)) {
            return false; // Player quit the game
          }
        }
      }
    }
    return true;
  }

  updateBlock(blockId: string, time: number, delta: number): boolean {
    const blockStates = this.game.logic.state?.blockStates;
    const variableStates = this.game.logic.state?.variableStates;
    const blockState = blockStates[blockId];
    const context = this.contexts[blockId];
    if (context && blockState) {
      this.game.logic.state.changedVariables.forEach((id) => {
        const state = variableStates[id];
        if (state) {
          context.valueMap[state.name] = state.value;
        }
      });
      this.game.logic.state.changedBlocks.forEach((id) => {
        const state = blockStates[id];
        if (state) {
          context.valueMap[state.name] = state.executionCount;
        }
      });
      if (blockState.loaded && this.runner.blockRunner) {
        const running = this.runner.blockRunner.update(
          blockId,
          context,
          this.game,
          time,
          delta
        );
        if (running === null) {
          return false;
        }
      }
    }
    return true;
  }
}
