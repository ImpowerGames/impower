import { SparkProgram } from "../../../../sparkdown/src";
import getSectionAtLine from "../../../../sparkdown/src/utils/getSectionAtLine";
import { CommandData } from "../../data";
import { Game, GameConfig, GameState } from "../../game";
import { CommandRunner } from "../../runner";
import { GameRunner } from "../../runner/classes/GameRunner";
import { ContextOptions } from "../interfaces/ContextOptions";
import { generateBlocks } from "../utils/generateBlocks";
import { generateVariables } from "../utils/generateVariables";

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
      commands: {
        runner: CommandRunner<G>;
        data: CommandData;
      }[];
    };
  } = {};
  public get contexts(): {
    [id: string]: {
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
      throw new Error(
        `Could not find program with id '${entryProgramId}' in: ${Object.keys(
          programs
        )}`
      );
    }
    const blockMap = generateBlocks(entryProgramId, program?.sections || {});
    const variableMap = generateVariables(
      entryProgramId,
      program?.variables || {}
    );
    const [startBlockId] = getSectionAtLine(entryLine, program?.sections || {});
    const startRuntimeBlock = blockMap?.[startBlockId];
    let startCommandIndex = 0;
    const startCommands = Object.values(startRuntimeBlock?.commands || {});
    for (let i = 1; i < startCommands?.length || 0; i += 1) {
      const command = startCommands[i];
      if (
        command &&
        command.params?.check !== "end" &&
        command.source.line > entryLine
      ) {
        break;
      } else {
        startCommandIndex = i;
      }
    }
    const c = {
      ...(options?.config || {}),
      logic: { blockMap, variableMap },
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
        const commands: {
          runner: CommandRunner<G>;
          data: CommandData;
        }[] = Object.entries(block.commands || {}).map(([_, v]) => {
          const r = this.runner.getCommandRunner(v.reference.typeId);
          return { runner: r as CommandRunner<G>, data: v as CommandData };
        });
        this._contexts[blockId] = {
          commands,
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

  dispose(): void {
    this.runner.commandRunners.forEach((r) => {
      r.onDestroy(this.game);
    });
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
            if (!this.updateBlock(blockId)) {
              return false; // Player quit the game
            }
          }
        }
      }
    }
    return true;
  }

  updateBlock(blockId: string): boolean {
    const blockStates = this.game.logic.state?.blockStates;
    const blockState = blockStates[blockId];
    const context = this.contexts[blockId];
    if (context && blockState) {
      if (blockState.loaded && this.runner.blockRunner) {
        const running = this.runner.blockRunner.update(
          blockId,
          context,
          this.game
        );
        if (running === null) {
          return false;
        }
      }
    }
    return true;
  }
}
