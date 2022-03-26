import { OrderedCollection } from "../../../impower-core";
import {
  CommandTypeId,
  ConfigTypeId,
  DataType,
  InstanceData,
  TypeLookup,
} from "../../data";
import { InstanceRunner } from "../../project/classes/instance/instanceRunner";
import { ConfigRunner } from "../../project/classes/instances/config/configRunner";
import { BlockRunner } from "../../project/classes/instances/containers/block/blockRunner";
import { CommandRunner } from "../../project/classes/instances/items/command/commandRunner";
import { PauseAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/pauseAudioCommand/pauseAudioCommandRunner";
import { PlayAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/playAudioCommand/playAudioCommandRunner";
import { ResumeAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/resumeAudioCommand/resumeAudioCommandRunner";
import { StopAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/stopAudioCommand/stopAudioCommandRunner";
import { ConditionCommandRunner } from "../../project/classes/instances/items/commands/conditional/conditionCommand/conditionCommandRunner";
import { AssignCommandRunner } from "../../project/classes/instances/items/commands/data/assignCommand/assignCommandRunner";
import { ChoiceCommandRunner } from "../../project/classes/instances/items/commands/dialog/choiceCommand/choiceCommandRunner";
import { DisplayCommandRunner } from "../../project/classes/instances/items/commands/dialog/displayCommand/displayCommandRunner";
import { CreateCommandRunner } from "../../project/classes/instances/items/commands/entity/createCommand/createCommandRunner";
import { DestroyCommandRunner } from "../../project/classes/instances/items/commands/entity/destroyCommand/destroyCommandRunner";
import { EndCommandRunner } from "../../project/classes/instances/items/commands/flow/endCommand/endCommandRunner";
import { EnterCommandRunner } from "../../project/classes/instances/items/commands/flow/enterCommand/enterCommandRunner";
import { LogCommandRunner } from "../../project/classes/instances/items/commands/flow/logCommand/logCommandRunner";
import { RepeatCommandRunner } from "../../project/classes/instances/items/commands/flow/repeatCommand/repeatCommandRunner";
import { ReturnCommandRunner } from "../../project/classes/instances/items/commands/flow/returnCommand/returnCommandRunner";
import { WaitCommandRunner } from "../../project/classes/instances/items/commands/flow/waitCommand/waitCommandRunner";
import { HideImageCommandRunner } from "../../project/classes/instances/items/commands/image/hideImageCommand/hideImageCommandRunner";
import { MoveToImageCommandRunner } from "../../project/classes/instances/items/commands/image/moveToImageCommand/moveToImageCommandRunner";
import { RotateToImageCommandRunner } from "../../project/classes/instances/items/commands/image/rotateImageCommand/rotateImageCommandRunner";
import { ScaleToImageCommandRunner } from "../../project/classes/instances/items/commands/image/scaleImageCommand/scaleImageCommandRunner";
import { ShowImageCommandRunner } from "../../project/classes/instances/items/commands/image/showImageCommand/showImageCommandRunner";

interface InstanceContextData<
  D extends InstanceData,
  R extends InstanceRunner<D>
> {
  runner: R;
  data: D;
}

export class ImpowerGameRunner {
  private static _instance: ImpowerGameRunner;

  public static get instance(): ImpowerGameRunner {
    if (!this._instance) {
      this._instance = new ImpowerGameRunner();
    }
    return this._instance;
  }

  public static set instance(value: ImpowerGameRunner) {
    this._instance = value;
  }

  private _configRunners: {
    [refTypeId in ConfigTypeId]: ConfigRunner;
  } = {
    BackgroundConfig: new ConfigRunner(),
    DebugConfig: new ConfigRunner(),
    PhysicsConfig: new ConfigRunner(),
    SaveConfig: new ConfigRunner(),
    ScaleConfig: new ConfigRunner(),
    AdvancedConfig: new ConfigRunner(),
  };

  public get configRunners(): {
    [refTypeId in ConfigTypeId]: ConfigRunner;
  } {
    return { ...this._configRunners };
  }

  private _blockRunners: {
    [refTypeId in "Block"]: BlockRunner;
  } = {
    Block: BlockRunner.instance,
  };

  public get blockRunners(): {
    [refTypeId in "Block"]: BlockRunner;
  } {
    return { ...this._blockRunners };
  }

  private _commandRunners: {
    [refTypeId in CommandTypeId]: CommandRunner;
  } = {
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
    CreateCommand: new CreateCommandRunner(),
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

  public get commandRunners(): {
    [refTypeId in CommandTypeId]: CommandRunner;
  } {
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

  findRunners(
    type: DataType
  ):
    | { [refTypeId: string]: ConfigRunner }
    | { [refTypeId: string]: BlockRunner }
    | { [refTypeId: string]: CommandRunner } {
    switch (type) {
      case "Config": {
        return this._configRunners;
      }
      case "Block": {
        return this._blockRunners;
      }
      case "Command": {
        return this._commandRunners;
      }
      default:
        throw new Error(`'${type}' not recognized as a DataType`);
    }
  }

  findRunner(typeLookup: TypeLookup): InstanceRunner {
    const { refType, refTypeId } = typeLookup;
    const runner = this.findRunners(refType)[refTypeId];
    if (runner) {
      return runner;
    }
    switch (refType) {
      case "Config": {
        return ConfigRunner.instance;
      }
      case "Block": {
        return BlockRunner.instance;
      }
      case "Command": {
        return CommandRunner.instance;
      }
      default:
        throw new Error(`'${refType}' not recognized as a DataType`);
    }
  }

  getRuntimeData<D extends InstanceData, R extends InstanceRunner<D>>(
    dataList: OrderedCollection<D>
  ): InstanceContextData<D, R>[] {
    const runners: { runner: R; data: D }[] = [];
    dataList?.order?.forEach((id) => {
      const data = dataList.data[id];
      const runner = this.findRunner(data.reference) as R;
      runners.push({ runner, data });
    });
    return runners;
  }

  getLevels(instances: InstanceData[]): { [refId: string]: number } {
    const newLevels: { [refId: string]: number } = {};
    let level = 0;
    let group: InstanceData;
    instances.forEach((item) => {
      const { refId } = item.reference;
      const data = item;
      const runner = this.findRunner(data.reference);
      if (runner.closesGroup(data, group)) {
        group = undefined;
        level -= 1;
        newLevels[refId] = level;
      }
      if (runner.opensGroup(data)) {
        group = data;
        newLevels[refId] = level;
        level += 1;
      }
      if (!runner.opensGroup(data) && !runner.closesGroup(data, group)) {
        newLevels[refId] = level;
      }
    });
    return newLevels;
  }
}
