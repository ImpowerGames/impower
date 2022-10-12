import { InstanceData } from "../../project/classes/instance/InstanceData";
import { InstanceRunner } from "../../project/classes/instance/InstanceRunner";
import { ConfigRunner } from "../../project/classes/instances/config/ConfigRunner";
import { ConfigTypeId } from "../../project/classes/instances/config/ConfigTypeId";
import { BlockRunner } from "../../project/classes/instances/containers/block/BlockRunner";
import { CommandRunner } from "../../project/classes/instances/items/command/CommandRunner";
import { CommandTypeId } from "../../project/classes/instances/items/command/CommandTypeId";
import { PauseAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/pauseAudioCommand/PauseAudioCommandRunner";
import { PlayAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/playAudioCommand/PlayAudioCommandRunner";
import { ResumeAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/resumeAudioCommand/ResumeAudioCommandRunner";
import { StopAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/stopAudioCommand/StopAudioCommandRunner";
import { ConditionCommandRunner } from "../../project/classes/instances/items/commands/conditional/conditionCommand/ConditionCommandRunner";
import { AssignCommandRunner } from "../../project/classes/instances/items/commands/data/assignCommand/AssignCommandRunner";
import { ChoiceCommandRunner } from "../../project/classes/instances/items/commands/dialog/choiceCommand/ChoiceCommandRunner";
import { DisplayCommandRunner } from "../../project/classes/instances/items/commands/dialog/displayCommand/DisplayCommandRunner";
import { DestroyCommandRunner } from "../../project/classes/instances/items/commands/entity/destroyCommand/DestroyCommandRunner";
import { SpawnCommandRunner } from "../../project/classes/instances/items/commands/entity/spawnCommand/SpawnCommandRunner";
import { EndCommandRunner } from "../../project/classes/instances/items/commands/flow/endCommand/EndCommandRunner";
import { EnterCommandRunner } from "../../project/classes/instances/items/commands/flow/enterCommand/EnterCommandRunner";
import { LogCommandRunner } from "../../project/classes/instances/items/commands/flow/logCommand/LogCommandRunner";
import { RepeatCommandRunner } from "../../project/classes/instances/items/commands/flow/repeatCommand/RepeatCommandRunner";
import { ReturnCommandRunner } from "../../project/classes/instances/items/commands/flow/returnCommand/ReturnCommandRunner";
import { WaitCommandRunner } from "../../project/classes/instances/items/commands/flow/waitCommand/WaitCommandRunner";
import { HideImageCommandRunner } from "../../project/classes/instances/items/commands/image/hideImageCommand/HideImageCommandRunner";
import { MoveToImageCommandRunner } from "../../project/classes/instances/items/commands/image/moveToImageCommand/MoveToImageCommandRunner";
import { RotateToImageCommandRunner } from "../../project/classes/instances/items/commands/image/rotateImageCommand/RotateImageCommandRunner";
import { ScaleToImageCommandRunner } from "../../project/classes/instances/items/commands/image/scaleImageCommand/ScaleImageCommandRunner";
import { ShowImageCommandRunner } from "../../project/classes/instances/items/commands/image/showImageCommand/ShowImageCommandRunner";

interface InstanceContextData<
  D extends InstanceData,
  R extends InstanceRunner<D>
> {
  runner: R;
  data: D;
}

interface RunnerTypeMap {
  Config: ConfigRunner;
  Block: BlockRunner;
  Command: CommandRunner;
}

export class SparkGameRunner {
  static _instance: SparkGameRunner;

  static get instance(): SparkGameRunner {
    if (!this._instance) {
      this._instance = new SparkGameRunner();
    }
    return this._instance;
  }

  private _configRunners: Record<ConfigTypeId, ConfigRunner> &
    Record<string, ConfigRunner> = {
    BackgroundConfig: new ConfigRunner(),
    DebugConfig: new ConfigRunner(),
    PhysicsConfig: new ConfigRunner(),
    SaveConfig: new ConfigRunner(),
    ScaleConfig: new ConfigRunner(),
    AdvancedConfig: new ConfigRunner(),
  };

  public get configRunners(): Record<string, ConfigRunner> {
    return { ...this._configRunners };
  }

  private _blockRunners: Record<"Block", BlockRunner> &
    Record<string, BlockRunner> = {
    Block: new BlockRunner(),
  };

  public get blockRunners(): Record<string, BlockRunner> {
    return { ...this._blockRunners };
  }

  private _commandRunners: Record<CommandTypeId, CommandRunner> &
    Record<string, CommandRunner> = {
    LogCommand: new LogCommandRunner(),
    EnterCommand: new EnterCommandRunner(),
    ReturnCommand: new ReturnCommandRunner(),
    RepeatCommand: new RepeatCommandRunner(),
    EndCommand: new EndCommandRunner(),
    WaitCommand: new WaitCommandRunner(),
    ConditionCommand: new ConditionCommandRunner(),
    AssignCommand: new AssignCommandRunner(),
    DisplayCommand: new DisplayCommandRunner(),
    ChoiceCommand: new ChoiceCommandRunner(),
    SpawnCommand: new SpawnCommandRunner(),
    DestroyCommand: new DestroyCommandRunner(),
    ShowImageCommand: new ShowImageCommandRunner(),
    MoveToImageCommand: new MoveToImageCommandRunner(),
    RotateToImageCommand: new RotateToImageCommandRunner(),
    ScaleToImageCommand: new ScaleToImageCommandRunner(),
    HideImageCommand: new HideImageCommandRunner(),
    PlayAudioCommand: new PlayAudioCommandRunner(),
    PauseAudioCommand: new PauseAudioCommandRunner(),
    ResumeAudioCommand: new ResumeAudioCommandRunner(),
    StopAudioCommand: new StopAudioCommandRunner(),
  };

  public get commandRunners(): Record<string, CommandRunner> {
    return { ...this._commandRunners };
  }

  registerConfigRunner(refTypeId: string, inspector: ConfigRunner): void {
    this._configRunners[refTypeId] = inspector;
  }

  unregisterConfigRunner(refTypeId: string): void {
    delete this._configRunners[refTypeId];
  }

  registerBlockRunner(refTypeId: string, inspector: BlockRunner): void {
    this._blockRunners[refTypeId] = inspector;
  }

  unregisterBlockRunner(refTypeId: string): void {
    delete this._blockRunners[refTypeId];
  }

  registerCommandRunner(refTypeId: string, inspector: CommandRunner): void {
    this._commandRunners[refTypeId] = inspector;
  }

  unregisterCommandRunner(refTypeId: string): void {
    delete this._commandRunners[refTypeId];
  }

  getRunners<K extends keyof RunnerTypeMap>(
    type: K
  ): Record<string, RunnerTypeMap[K]> {
    switch (type) {
      case "Config": {
        return this._configRunners as Record<string, RunnerTypeMap[K]>;
      }
      case "Block": {
        return this._blockRunners as Record<string, RunnerTypeMap[K]>;
      }
      case "Command": {
        return this._commandRunners as Record<string, RunnerTypeMap[K]>;
      }
      default:
        throw new Error(`'${type}' not recognized as a DataType`);
    }
  }

  getRunner(typeLookup: {
    refType: "Config" | "Block" | "Command";
    refTypeId: string;
  }): InstanceRunner {
    const { refType, refTypeId } = typeLookup;
    const runner = this.getRunners(refType)?.[refTypeId];
    if (runner) {
      return runner;
    }
    switch (refType) {
      case "Config": {
        return new ConfigRunner();
      }
      case "Block": {
        return new BlockRunner();
      }
      case "Command": {
        return new CommandRunner();
      }
      default:
        throw new Error(`'${refType}' not recognized as a DataType`);
    }
  }

  getRuntimeData<D extends InstanceData, R extends InstanceRunner<D>>(
    data: Record<string, D>
  ): InstanceContextData<D, R>[] {
    const runners: { runner: R; data: D }[] = [];
    Object.keys(data || {}).forEach((id) => {
      const d = data[id];
      const r = this.getRunner(d.reference) as R;
      runners.push({ runner: r, data: d });
    });
    return runners;
  }
}
