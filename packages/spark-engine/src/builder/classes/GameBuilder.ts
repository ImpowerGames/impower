import { SparkProgram } from "../../../../sparkdown/src";
import { BlockData, Game, GameConfig, GameState } from "../../game";
import { GameContext } from "../../game/core/types/GameContext";
import { ICommandRunner } from "../../game/logic/types/ICommandRunner";
import { GameBuilderOptions } from "../types/GameBuilderOptions";
import combineBlockMap from "../utils/combineBlockMap";
import combineContext from "../utils/combineContext";
import combineStored from "../utils/combineStored";
import getCommandIndexAtLine from "../utils/getCommandIndexAtLine";
import getPreviewCommand from "../utils/getPreviewCommand";
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
  G extends Game = Game,
  C extends GameConfig = GameConfig,
  S extends GameState = GameState
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

  private _game: G;
  public get game() {
    return this._game;
  }

  private _programs: SparkProgram[];
  public get programs() {
    return this._programs;
  }

  private _startProgramIndex: number;
  public get startProgramIndex() {
    return this._startProgramIndex;
  }

  protected _commandRunnerMap: Record<string, ICommandRunner>;

  constructor(
    program: SparkProgram | SparkProgram[],
    options: GameBuilderOptions<G, C, S>
  ) {
    this._programs = Array.isArray(program) ? program : [program];
    this._startProgramIndex = options?.simulation?.startFromProgram ?? 0;
    const game = this.build(this._programs, options);
    this._commandRunnerMap = game.logic.runnerMap;
    this._game = game;
  }

  protected build(
    programs: SparkProgram[],
    options: GameBuilderOptions<G, C, S>
  ): G {
    const simulating = Boolean(options?.simulation);
    const simulateFromProgramIndex =
      options?.simulation?.simulateFromProgram ?? 0;
    const simulateFromLine = options?.simulation?.simulateFromLine ?? 0;
    const startFromProgramIndex = options?.simulation?.startFromProgram ?? 0;
    const startFromLine = options?.simulation?.startFromLine ?? 0;
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
    const context: GameContext = {};
    const storedSet = new Set<string>();
    const blockMap: Record<string, BlockData> = {};
    Object.entries(programs).forEach(([programId, program]) => {
      combineContext(program?.context, context);
      combineStored(program?.stored, storedSet);
      combineBlockMap(programId, program?.sections, blockMap);
    });
    const stored = Array.from(storedSet);
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
    context.game ??= {};
    context.game.simulating = simulating;
    const simulation = simulating
      ? {
          simulateFromBlockId: simulationBlockId,
          simulateFromCommandIndex: simulationCommandIndex,
          startFromBlockId: startFromBlockId,
          startFromCommandIndex: startFromCommandIndex,
        }
      : undefined;
    const c = {
      ...(options?.config || {}),
      logic: {
        ...(options?.config?.logic || {}),
        blockMap,
        simulation,
      },
      stored,
    } as C;
    const s = {
      ...(options?.state || {}),
    } as S;
    const game =
      options.createGame?.(context, c, s) || (new Game(context, c, s) as G);
    const commandRunnerMap = {
      LogCommand: new LogCommandRunner(game),
      JumpCommand: new JumpCommandRunner(game),
      ReturnCommand: new ReturnCommandRunner(game),
      EndCommand: new EndCommandRunner(game),
      WaitCommand: new WaitCommandRunner(game),
      BranchCommand: new BranchCommandRunner(game),
      EvaluateCommand: new EvaluateCommandRunner(game),
      SpawnCommand: new SpawnCommandRunner(game),
      DestroyCommand: new DestroyCommandRunner(game),
      DisplayCommand: new DisplayCommandRunner(game),
    } as unknown as Record<string, ICommandRunner>;
    game.logic.registerRunners(commandRunnerMap);
    return game;
  }

  preview(line: number): void {
    this.game.context.game ??= {};
    this.game.context.game.previewing = true;
    const program = this.programs[this.startProgramIndex];
    if (program) {
      const runtimeCommand = getPreviewCommand(program, line);
      if (runtimeCommand) {
        const commandRunner = this._commandRunnerMap[runtimeCommand.type];
        if (commandRunner) {
          commandRunner.onPreview(runtimeCommand);
        }
      } else {
        const previewVariable = getPreviewVariable(program, line);
        if (previewVariable?.type === "style") {
          this.game.ui.loadStyles();
        }
        if (previewVariable?.type === "ui") {
          this.game.ui.hideUI(...Object.keys(this.game.context?.["ui"] || {}));
          this.game.ui.loadStyles();
          this.game.ui.loadUI(previewVariable.name);
          this.game.ui.showUI(previewVariable.name);
        }
      }
    }
  }
}
