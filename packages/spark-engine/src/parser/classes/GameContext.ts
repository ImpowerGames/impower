import { SparkProgram } from "../../../../sparkdown/src";
import { Block, Game, GameConfig, GameState } from "../../game";
import { GameRunner } from "../../runner/classes/GameRunner";
import { GameContextOptions } from "../interfaces/GameContextOptions";
import { combineBlockMap } from "../utils/combineBlockMap";
import { combineValueMap } from "../utils/combineValueMap";
import getCommandIndexAtLine from "../utils/getCommandIndexAtLine";
import { getPreviewCommand } from "../utils/getPreviewCommand";
import { getPreviewVariable } from "../utils/getPreviewVariable";
import getSectionAtLine from "../utils/getSectionAtLine";

export class GameContext<
  G extends Game = Game,
  C extends GameConfig = GameConfig,
  S extends GameState = GameState,
  R extends GameRunner<G> = GameRunner<G>
> {
  private _game: G;
  public get game() {
    return this._game;
  }

  private _runner: R;
  public get runner() {
    return this._runner;
  }

  private _programs: SparkProgram[];
  public get programs() {
    return this._programs;
  }

  private _startProgramIndex: number;
  public get startProgramIndex() {
    return this._startProgramIndex;
  }

  constructor(
    program: SparkProgram | SparkProgram[],
    options: GameContextOptions<G, C, S, R>
  ) {
    this._programs = Array.isArray(program) ? program : [program];
    this._startProgramIndex = options.startFromProgram ?? 0;
    this._game = this.load(this._programs, options);
    this._runner =
      options.createRunner?.(this._game) || (new GameRunner(this._game) as R);

    this.runner.commandRunners.forEach((r) => {
      r.init();
    });
  }

  protected load(
    programs: SparkProgram[],
    options: GameContextOptions<G, C, S, R>
  ): G {
    const startFromProgramIndex = options?.startFromProgram ?? 0;
    const startFromLine = options?.startFromLine ?? 0;
    const simulating =
      options?.simulateFromProgram != null || options?.simulateFromLine != null;
    const simulateFromProgramIndex = options?.simulateFromProgram ?? 0;
    const simulateFromLine = options?.simulateFromLine ?? 0;
    const startFromProgram = startFromProgramIndex
      ? programs[startFromProgramIndex]
      : programs[0];
    if (!startFromProgram) {
      throw new Error(
        `Could not find program with id '${startFromProgramIndex}' in: ${Object.keys(
          programs
        )}`
      );
    }
    const blockMap: Record<string, Block> = {};
    const valueMap: Record<string, Record<string, any>> = {};
    Object.entries(programs).forEach(([programId, program]) => {
      combineBlockMap(programId, program?.sections, blockMap);
      combineValueMap(program?.context, valueMap);
    });
    const startFromBlockId =
      getSectionAtLine(startFromLine, startFromProgram?.sections) ?? "";
    const startFromCommandIndex = getCommandIndexAtLine(
      startFromLine,
      blockMap?.[startFromBlockId]?.commands
    );
    const simulationBlockId = simulating
      ? getSectionAtLine(
          simulateFromLine,
          programs[simulateFromProgramIndex]?.sections
        )
      : undefined;
    const simulationCommandIndex = simulating
      ? getCommandIndexAtLine(
          simulateFromLine,
          blockMap?.[simulationBlockId ?? ""]?.commands
        )
      : undefined;
    const c = {
      ...(options?.config || {}),
      environment: {
        simulating,
      },
      logic: {
        ...(options?.config?.logic || {}),
        blockMap,
        valueMap,
        simulateFromBlockId: simulationBlockId,
        simulateFromCommandIndex: simulationCommandIndex,
        startFromBlockId: startFromBlockId,
        startFromCommandIndex: startFromCommandIndex,
      },
    } as C;
    const s = {
      ...(options?.state || {}),
    } as S;
    const game = options.createGame?.(c, s) || (new Game(c, s) as G);
    this._game = game;
    return game;
  }

  init(): void {
    this.game.init();
  }

  dispose(): void {
    this.runner.commandRunners.forEach((r) => {
      r.onDestroy();
    });
    this.game.destroy();
  }

  update(deltaMS: number): boolean {
    if (deltaMS) {
      this.game.update(deltaMS);
      this.runner.commandRunners.forEach((r) => {
        r.onUpdate(deltaMS);
      });
      const loadedBlockIds = this.game.logic.state.loadedBlockIds;
      if (loadedBlockIds) {
        for (let i = 0; i < loadedBlockIds.length; i += 1) {
          const blockId = loadedBlockIds[i];
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

  getRunner = (typeId: string) => this.runner.getCommandRunner(typeId);

  protected updateBlock(blockId: string): boolean {
    const blockStates = this.game.logic.state?.blockStates;
    const blockState = blockStates[blockId];
    if (blockState) {
      if (blockState.loaded) {
        const running = this.game.logic.updateBlock(blockId, this.getRunner);
        if (running === null) {
          return false;
        }
      }
    }
    return true;
  }

  preview(line: number, debug: boolean): void {
    const program = this.programs[this.startProgramIndex];
    if (program) {
      const runtimeCommand = getPreviewCommand(program, line);
      if (runtimeCommand) {
        const commandRunner = this?.runner?.getCommandRunner(
          runtimeCommand.reference.typeId
        );
        if (commandRunner) {
          this.game.ui.loadTheme(this.game.logic.valueMap);
          this.game.ui.loadStyles(this.game.logic.valueMap);
          this.game.ui.loadUI(this.game.logic.valueMap);
          commandRunner.onPreview(runtimeCommand, {
            instant: true,
            debug,
          });
        }
      } else {
        const previewVariable = getPreviewVariable(program, line);
        if (previewVariable?.type === "style") {
          this.game.ui.loadStyles(this.game.logic.valueMap);
        }
        if (previewVariable?.type === "ui") {
          this.game.ui.hideUI(
            ...Object.keys(this.game.logic.valueMap?.["ui"] || {})
          );
          this.game.ui.loadStyles(this.game.logic.valueMap);
          this.game.ui.loadUI(this.game.logic.valueMap, previewVariable.name);
          this.game.ui.showUI(previewVariable.name);
        }
      }
    }
  }
}
