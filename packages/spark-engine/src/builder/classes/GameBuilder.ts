import { SparkProgram } from "../../../../sparkdown/src";
import {
  BlockData,
  Game,
  GameConfig,
  GameModules,
  RecursivePartial,
  WorldManager,
} from "../../game";
import { GameContext } from "../../game/core/types/GameContext";
import { ICommandRunner } from "../../game/modules/logic/types/ICommandRunner";
import { GameBuilderOptions } from "../types/GameBuilderOptions";
import combineBlockMap from "../utils/combineBlockMap";
import combineContext from "../utils/combineContext";
import combineStored from "../utils/combineStored";
import getCommandIndexAtLine from "../utils/getCommandIndexAtLine";
import getPreviewCommandToken from "../utils/getPreviewCommandToken";
import getPreviewVariable from "../utils/getPreviewVariable";
import getSectionAtLine from "../utils/getSectionAtLine";
import { BranchCommandRunner } from "./commands/branchCommand/BranchCommandRunner";
import { DestroyCommandRunner } from "./commands/destroyCommand/DestroyCommandRunner";
import { DisplayCommandRunner } from "./commands/displayCommand/DisplayCommandRunner";
import { EndCommandRunner } from "./commands/endCommand/EndCommandRunner";
import { EvaluateCommandRunner } from "./commands/evaluateCommand/EvaluateCommandRunner";
import { JumpCommandRunner } from "./commands/jumpCommand/JumpCommandRunner";
import { LogCommandRunner } from "./commands/logCommand/LogCommandRunner";
import { ReturnCommandRunner } from "./commands/returnCommand/ReturnCommandRunner";
import { SpawnCommandRunner } from "./commands/spawnCommand/SpawnCommandRunner";
import { WaitCommandRunner } from "./commands/waitCommand/WaitCommandRunner";

export class GameBuilder<
  C extends GameConfig = GameConfig,
  M extends GameModules = GameModules
> {
  private static _instance: GameBuilder;

  public static build(
    programs: SparkProgram[],
    options: GameBuilderOptions
  ): Game {
    if (!this._instance) {
      this._instance = new GameBuilder(programs, options);
    }
    return this._instance.build(programs, options);
  }

  private _game;
  public get game() {
    return this._game;
  }

  private _programs: SparkProgram[];
  public get programs() {
    return this._programs;
  }

  private _startpoint: { program: number; line: number };
  public get startpoint() {
    return this._startpoint;
  }

  protected _commandRunnerMap: Record<string, ICommandRunner>;

  constructor(
    program: SparkProgram | SparkProgram[],
    options: GameBuilderOptions<C, M>
  ) {
    this._programs = Array.isArray(program) ? program : [program];
    this._startpoint = options?.simulation?.startpoint || {
      program: 0,
      line: 0,
    };
    const game = this.build(this._programs, options);
    this._commandRunnerMap = game.module.logic.runnerMap;
    this._game = game;
  }

  protected build(programs: SparkProgram[], options: GameBuilderOptions<C, M>) {
    const simulating = Boolean(options?.simulation);
    const startFromProgramIndex = options.simulation?.startpoint?.program ?? 0;
    const startFromLine = options.simulation?.startpoint?.line ?? 0;
    const startFromProgram = programs[startFromProgramIndex];
    if (!startFromProgram) {
      throw new Error(
        `Could not find program with id '${startFromProgramIndex}' in: ${Object.keys(
          programs
        )}`
      );
    }
    const context: RecursivePartial<GameContext> = {};
    const storedSet = new Set<string>();
    const blockMap: Record<string, BlockData> = {};
    programs.forEach((program, file) => {
      combineContext(program?.context, context);
      combineStored(program?.stored, storedSet);
      combineBlockMap(file, program?.sections, blockMap);
    });
    const stored = Array.from(storedSet);
    const startFromBlockId =
      getSectionAtLine(startFromLine, startFromProgram?.sections) ?? "";
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
        programs[waypoint.program]?.sections
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
    const m = {
      ...(options?.modules || {}),
      world: WorldManager,
    };
    context.system ??= {};
    context.system!.previewing = options?.preview;
    context.system!.stored = stored;
    context.config = { ...(context.config || {}), ...(options?.config || {}) };
    context.config["logic"] ??= {};
    context.config["logic"]["blockMap"] = blockMap;
    context.config["logic"]["waypoints"] = waypoints;
    context.config["logic"]["startpoint"] = startpoint;
    const game = new Game<{ world: WorldManager }>(context, m);
    const commandRunnerMap = {
      LogCommand: new LogCommandRunner(game),
      JumpCommand: new JumpCommandRunner(game),
      ReturnCommand: new ReturnCommandRunner(game),
      EndCommand: new EndCommandRunner(game),
      WaitCommand: new WaitCommandRunner(game),
      BranchCommand: new BranchCommandRunner(game),
      EvaluateCommand: new EvaluateCommandRunner(game),
      DisplayCommand: new DisplayCommandRunner(game),
      SpawnCommand: new SpawnCommandRunner(game),
      DestroyCommand: new DestroyCommandRunner(game),
    } as unknown as Record<string, ICommandRunner>;
    game.module.logic.registerRunners(commandRunnerMap);
    return game;
  }

  preview(line: number): void {
    const program = this.programs[this.startpoint.program];
    if (program) {
      const commandToken = getPreviewCommandToken(program, line);
      if (commandToken?.id) {
        this.game.preview(commandToken.id);
      } else {
        const previewVariable = getPreviewVariable(program, line);
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
