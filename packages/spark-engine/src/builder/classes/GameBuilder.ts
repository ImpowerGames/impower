import { SparkProgram } from "../../../../sparkdown/src";
import { Game, GameModules, RecursivePartial } from "../../game";
import { GameContext } from "../../game/core/types/GameContext";
import { GameBuilderOptions } from "../types/GameBuilderOptions";
import generateBlockMap from "../utils/generateBlockMap";
import getCommandIndexAtLine from "../utils/getCommandIndexAtLine";
import getPreviewCommandTokenAtLine from "../utils/getPreviewCommandTokenAtLine";
import getPreviewVariableAtLine from "../utils/getPreviewVariableAtLine";
import getSectionAtLine from "../utils/getSectionAtLine";

export class GameBuilder<M extends GameModules = GameModules> {
  private static _instance: GameBuilder;

  public static build(
    program: SparkProgram,
    options: GameBuilderOptions
  ): Game {
    if (!this._instance) {
      this._instance = new GameBuilder(program, options);
    }
    return this._instance.build(program, options);
  }

  private _game;
  public get game() {
    return this._game;
  }

  private _program: SparkProgram;
  public get program() {
    return this._program;
  }

  private _startpoint: { file?: string; line: number };
  public get startpoint() {
    return this._startpoint;
  }

  constructor(program: SparkProgram, options: GameBuilderOptions<M>) {
    this._program = program;
    this._startpoint = options?.simulation?.startpoint || {
      line: 0,
    };
    const game = this.build(this._program, options);
    this._game = game;
  }

  protected build(program: SparkProgram, options: GameBuilderOptions<M>) {
    const previewing = options?.previewing;
    const simulating = Boolean(options?.simulation);
    const startFromFile = options.simulation?.startpoint?.file ?? "";
    const startFromLine = options.simulation?.startpoint?.line ?? 0;
    const blockMap: Record<string, any> = {};
    generateBlockMap(program.sections, blockMap);
    const startFromBlockId =
      getSectionAtLine(startFromLine, program?.sections) ?? "";
    const startFromCommandIndex = getCommandIndexAtLine(
      startFromLine,
      blockMap?.[startFromBlockId]?.commands
    );
    const startpoint = simulating
      ? blockMap?.[startFromBlockId]?.commands?.[startFromCommandIndex]?.id ??
        ""
      : undefined;
    const waypoints: string[] = [];
    options.simulation?.waypoints?.forEach((waypoint) => {
      const simulateFromBlockId = getSectionAtLine(
        waypoint.line,
        program.sections
      );
      // TODO: Allow choices to be waypoints
      const simulateFromCommandIndex = getCommandIndexAtLine(
        waypoint.line,
        blockMap?.[simulateFromBlockId ?? ""]?.commands
      );
      const simulateFromCheckpointId =
        blockMap?.[simulateFromBlockId]?.commands?.[simulateFromCommandIndex]
          ?.id ?? blockMap?.[simulateFromBlockId]?.name;
      if (simulateFromCheckpointId != null) {
        waypoints.push(simulateFromCheckpointId);
      }
    });
    const context: RecursivePartial<GameContext> = {};
    context.config ??= {};
    context.config!["logic"] ??= {};
    context.config!["logic"]["waypoints"] = waypoints;
    context.config!["logic"]["startpoint"] = startpoint;
    const game = new Game(program.compiled!, { previewing });
    return game;
  }

  preview(line: number): void {
    const program = this.program;
    if (program) {
      const commandToken = getPreviewCommandTokenAtLine(program, line);
      if (commandToken?.id) {
        this.game.preview(commandToken.id);
      } else {
        const previewVariable = getPreviewVariableAtLine(program, line);
        if (previewVariable?.type === "style") {
          this.game.module.ui.loadStyles();
        }
        if (previewVariable?.type === "ui") {
          this.game.module.ui.hideUI(
            ...Object.keys(this.game.context?.["ui"] || {})
          );
          this.game.module.ui.loadStyles();
          this.game.module.ui.loadUI(previewVariable.name);
          this.game.module.ui.showUI(previewVariable.name);
        }
      }
    }
  }
}
