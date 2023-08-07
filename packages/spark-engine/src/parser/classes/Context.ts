import {
  getScopedValueContext,
  getSectionAtLine,
  SparkProgram,
} from "../../../../sparkdown/src";
import { CommandData } from "../../data";
import { Block, Game, GameConfig, GameState } from "../../game";
import { CommandRunner } from "../../runner";
import { GameRunner } from "../../runner/classes/GameRunner";
import { ContextOptions } from "../interfaces/ContextOptions";
import { generateSectionBlocks } from "../utils/generateSectionBlocks";

export class Context<
  G extends Game = Game,
  C extends GameConfig = GameConfig,
  S extends GameState = GameState,
  R extends GameRunner<G> = GameRunner<G>
> {
  private _game: G;
  public get game(): G {
    return this._game;
  }

  private _runner: R;
  public get runner(): R {
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
      objectMap: { [type: string]: Record<string, any> };
      triggers: string[];
      parameters: string[];
      commands: {
        runner: CommandRunner<G>;
        data: CommandData;
      }[];
    };
  } = {};
  public get contexts(): {
    [id: string]: {
      ids: Record<string, string>;
      valueMap: Record<string, unknown>;
      objectMap: { [type: string]: Record<string, any> };
      triggers: string[];
      parameters: string[];
      commands: {
        runner: CommandRunner<G>;
        data: CommandData;
      }[];
    };
  } {
    return this._contexts;
  }

  private _programs: Record<string, SparkProgram>;
  public get programs(): Record<string, SparkProgram> {
    return this._programs;
  }

  private _entryProgramId: string;
  public get entryProgramId(): string {
    return this._entryProgramId;
  }

  constructor(
    programs: Record<string, SparkProgram>,
    options: ContextOptions<G, C, S, R>
  ) {
    this._programs = programs;
    this._runner = options.runner || (new GameRunner() as R);
    this._editable = options?.editable || false;
    this._game = this.load(programs, options);
    this._entryProgramId = options.entryProgram || "";
  }

  load(
    programs: Record<string, SparkProgram>,
    options: ContextOptions<G, C, S, R>
  ): G {
    const entryProgramId = options?.entryProgram || "";
    const entryLine = options?.entryLine || 0;
    const program = entryProgramId
      ? programs[entryProgramId]
      : Object.values(programs)[0];
    if (!program) {
      throw new Error(`Could not find program with id: ${entryProgramId}`);
    }
    const blockMap = generateSectionBlocks(program?.sections || {});
    const [startBlockId] = getSectionAtLine(entryLine, program?.sections || {});
    const startRuntimeBlock = blockMap?.[startBlockId];
    let startCommandIndex = 0;
    const startCommands = Object.values(startRuntimeBlock?.commands || {});
    for (let i = 1; i < startCommands?.length || 0; i += 1) {
      const command = startCommands[i];
      if (command && command.check !== "close" && command.line > entryLine) {
        break;
      } else {
        startCommandIndex = i;
      }
    }
    const c = {
      ...(options?.config || {}),
      logic: { blockMap },
      struct: { objectMap: program.objectMap },
    } as C;
    const s = {
      ...(options?.state || {}),
      logic: {
        ...(options?.state?.logic || {}),
        activeParentBlockId: startBlockId,
        activeCommandIndex: startCommandIndex,
      },
    } as S;
    const game = options.createGame?.(c, s) || (new Game(c, s) as G);
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
    this._game = game;
    return game;
  }

  init(): void {
    this.game.init();
  }

  end(): void {
    this.game.destroy();
  }

  update(deltaMS: number): boolean {
    if (deltaMS) {
      this.game.update(deltaMS);
      this.runner.commandRunners.forEach((r) => {
        r.onUpdate(this.game, deltaMS);
      });
      if (this.loadedBlockIds) {
        for (let i = 0; i < this.loadedBlockIds.length; i += 1) {
          const blockId = this.loadedBlockIds[i];
          if (blockId !== undefined) {
            if (!this.updateBlock(blockId, deltaMS)) {
              return false; // Player quit the game
            }
          }
        }
      }
    }
    return true;
  }

  updateBlock(blockId: string, deltaMS: number): boolean {
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
          deltaMS
        );
        if (running === null) {
          return false;
        }
      }
    }
    return true;
  }
}
