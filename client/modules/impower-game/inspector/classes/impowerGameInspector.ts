import format from "../../../impower-config/utils/format";
import {
  getAllVisiblePropertyPaths,
  getUniqueName,
  getUuid,
  getValue,
  isNameable,
} from "../../../impower-core";
import setValue from "../../../impower-core/utils/setValue";
import {
  CommandTypeId,
  ConfigTypeId,
  DataType,
  GameProjectData,
  InstanceData,
  isBranchable,
  isDynamicValue,
  isReference,
  Permission,
  Reference,
  TypeLookup,
} from "../../data";
import { InstanceInspector } from "../../project/classes/instance/instanceInspector";
import { ConfigInspector } from "../../project/classes/instances/config/configInspector";
import { AdvancedConfigInspector } from "../../project/classes/instances/configs/advancedConfig/advancedConfigInspector";
import { BackgroundConfigInspector } from "../../project/classes/instances/configs/backgroundConfig/backgroundConfigInspector";
import { DebugConfigInspector } from "../../project/classes/instances/configs/debugConfig/debugConfigInspector";
import { PhysicsConfigInspector } from "../../project/classes/instances/configs/physicsConfig/physicsConfigInspector";
import { SaveConfigInspector } from "../../project/classes/instances/configs/saveConfig/saveConfigInspector";
import { ScaleConfigInspector } from "../../project/classes/instances/configs/scaleConfig/scaleConfigInspector";
import { BlockInspector } from "../../project/classes/instances/containers/block/blockInspector";
import { CommandInspector } from "../../project/classes/instances/items/command/commandInspector";
import { PauseAudioCommandInspector } from "../../project/classes/instances/items/commands/audio/pauseAudioCommand/pauseAudioCommandInspector";
import { PlayAudioCommandInspector } from "../../project/classes/instances/items/commands/audio/playAudioCommand/playAudioCommandInspector";
import { ResumeAudioCommandInspector } from "../../project/classes/instances/items/commands/audio/resumeAudioCommand/resumeAudioCommandInspector";
import { StopAudioCommandInspector } from "../../project/classes/instances/items/commands/audio/stopAudioCommand/stopAudioCommandInspector";
import { ConditionCommandInspector } from "../../project/classes/instances/items/commands/conditional/conditionCommand/conditionCommandInspector";
import { AssignCommandInspector } from "../../project/classes/instances/items/commands/data/assignCommand/assignCommandInspector";
import { ChoiceCommandInspector } from "../../project/classes/instances/items/commands/dialog/choiceCommand/choiceCommandInspector";
import { DisplayCommandInspector } from "../../project/classes/instances/items/commands/dialog/displayCommand/displayCommandInspector";
import { CreateCommandInspector } from "../../project/classes/instances/items/commands/entity/createCommand/createCommandInspector";
import { DestroyCommandInspector } from "../../project/classes/instances/items/commands/entity/destroyCommand/destroyCommandInspector";
import { EndCommandInspector } from "../../project/classes/instances/items/commands/flow/endCommand/endCommandInspector";
import { EnterCommandInspector } from "../../project/classes/instances/items/commands/flow/enterCommand/enterCommandInspector";
import { LogCommandInspector } from "../../project/classes/instances/items/commands/flow/logCommand/logCommandInspector";
import { RepeatCommandInspector } from "../../project/classes/instances/items/commands/flow/repeatCommand/repeatCommandInspector";
import { ReturnCommandInspector } from "../../project/classes/instances/items/commands/flow/returnCommand/returnCommandInspector";
import { WaitCommandInspector } from "../../project/classes/instances/items/commands/flow/waitCommand/waitCommandInspector";
import { HideImageCommandInspector } from "../../project/classes/instances/items/commands/image/hideImageCommand/hideImageCommandInspector";
import { MoveToImageCommandInspector } from "../../project/classes/instances/items/commands/image/moveToImageCommand/moveToImageCommandInspector";
import { RotateToImageCommandInspector } from "../../project/classes/instances/items/commands/image/rotateImageCommand/rotateImageCommandInspector";
import { ScaleToImageCommandInspector } from "../../project/classes/instances/items/commands/image/scaleImageCommand/scaleImageCommandInspector";
import { ShowImageCommandInspector } from "../../project/classes/instances/items/commands/image/showImageCommand/showImageCommandInspector";
import { getAllData } from "../utils/getAllData";
import { getData } from "../utils/getData";

export class ImpowerGameInspector {
  private static _instance: ImpowerGameInspector;

  public static get instance(): ImpowerGameInspector {
    if (!this._instance) {
      this._instance = new ImpowerGameInspector();
    }
    return this._instance;
  }

  public static set instance(value: ImpowerGameInspector) {
    this._instance = value;
  }

  private _configInspectors: {
    [refTypeId in ConfigTypeId]: ConfigInspector;
  } = {
    BackgroundConfig: new BackgroundConfigInspector(),
    DebugConfig: new DebugConfigInspector(),
    PhysicsConfig: new PhysicsConfigInspector(),
    SaveConfig: new SaveConfigInspector(),
    ScaleConfig: new ScaleConfigInspector(),
    AdvancedConfig: new AdvancedConfigInspector(),
  };

  private _blockInspectors: {
    [refTypeId in "Block"]: BlockInspector;
  } = {
    Block: BlockInspector.instance,
  };

  private _commandInspectors: {
    [refTypeId in CommandTypeId]: CommandInspector;
  } = {
    LogCommand: new LogCommandInspector(),
    EnterCommand: new EnterCommandInspector(),
    ReturnCommand: new ReturnCommandInspector(),
    RepeatCommand: new RepeatCommandInspector(),
    EndCommand: new EndCommandInspector(),
    WaitCommand: new WaitCommandInspector(),
    ConditionCommand: new ConditionCommandInspector(),
    AssignCommand: new AssignCommandInspector(),
    DisplayCommand: new DisplayCommandInspector(),
    ChoiceCommand: new ChoiceCommandInspector(),
    CreateCommand: new CreateCommandInspector(),
    DestroyCommand: new DestroyCommandInspector(),
    ShowImageCommand: new ShowImageCommandInspector(),
    MoveToImageCommand: new MoveToImageCommandInspector(),
    RotateToImageCommand: new RotateToImageCommandInspector(),
    ScaleToImageCommand: new ScaleToImageCommandInspector(),
    HideImageCommand: new HideImageCommandInspector(),
    PlayAudioCommand: new PlayAudioCommandInspector(),
    StopAudioCommand: new StopAudioCommandInspector(),
    PauseAudioCommand: new PauseAudioCommandInspector(),
    ResumeAudioCommand: new ResumeAudioCommandInspector(),
  };

  registerConfigInspector(refTypeId: string, inspector: ConfigInspector): void {
    this._configInspectors[refTypeId] = inspector;
  }

  unregisterConfigInspector(refTypeId: string): void {
    delete this._configInspectors[refTypeId];
  }

  registerBlockInspector(refTypeId: string, inspector: BlockInspector): void {
    this._blockInspectors[refTypeId] = inspector;
  }

  unregisterBlockInspector(refTypeId: string): void {
    delete this._blockInspectors[refTypeId];
  }

  registerCommandInspector(
    refTypeId: string,
    inspector: CommandInspector
  ): void {
    this._commandInspectors[refTypeId] = inspector;
  }

  unregisterCommandInspector(refTypeId: string): void {
    delete this._commandInspectors[refTypeId];
  }

  getInspectors<T extends ConfigInspector | BlockInspector | CommandInspector>(
    type: DataType
  ): { [refTypeId: string]: T } {
    switch (type) {
      case "Config": {
        return this._configInspectors as unknown as {
          [refTypeId: string]: T;
        };
      }
      case "Block": {
        return this._blockInspectors as unknown as { [refTypeId: string]: T };
      }
      case "Command": {
        return this._commandInspectors as unknown as {
          [refTypeId: string]: T;
        };
      }
      default:
        throw new Error(`'${type}' not recognized as a DataType`);
    }
  }

  getInspector(typeLookup: TypeLookup): InstanceInspector {
    const { refType, refTypeId } = typeLookup;
    if (refTypeId) {
      const inspector = this.getInspectors(refType)[refTypeId];
      if (inspector) {
        return inspector;
      }
    }
    switch (refType) {
      case "Config": {
        return ConfigInspector.instance;
      }
      case "Block": {
        return BlockInspector.instance;
      }
      case "Command": {
        return CommandInspector.instance;
      }
      default:
        throw new Error(`'${refType}' not recognized as a DataType`);
    }
  }

  createNewData(reference: Partial<Reference>): InstanceData {
    const { refType } = reference;
    const refTypeId = reference.refTypeId || "";
    const refId = reference.refId || getUuid();
    return this.getInspector({
      ...reference,
      refType,
      refTypeId,
    }).createData({
      reference: {
        ...reference,
        refType,
        refTypeId,
        refId,
      },
    });
  }

  getReferenceName(reference: Reference, project: GameProjectData): string {
    const referenceData = getData(reference, project);
    if (referenceData) {
      if (isNameable(referenceData)) {
        return `${referenceData.name}`;
      }
      if (referenceData.reference) {
        return `${this.getInspector(referenceData.reference).getName(
          referenceData
        )}`;
      }
      if (referenceData.fileName) {
        return `${referenceData.fileName}`;
      }
    }
    return `None`;
  }

  getFormattedSummary<D extends InstanceData>(
    summary: string,
    data: D
  ): string {
    const inspector = this.getInspector(data.reference);
    let formattedSummary = summary;
    const argTags = formattedSummary.match(/\{(.*?)\}/g);
    if (argTags) {
      const args: { [arg: string]: string } = {};
      argTags.forEach((argTag) => {
        const arg = argTag.substring(1, argTag.length - 1);
        let argString = "(Object)";
        const value = getValue(data, arg);
        if (isDynamicValue(value)) {
          argString = value?.name;
        } else {
          argString = inspector.getPropertyDisplayValue(arg, data, value);
        }
        const safeArg = arg.replace(/\./g, "_");
        args[safeArg] = argString;
        const reg = new RegExp(arg, "g");
        formattedSummary = formattedSummary.replace(reg, safeArg);
      });
      try {
        formattedSummary = format(formattedSummary, args);
      } catch {
        return formattedSummary;
      }
    }
    return formattedSummary;
  }

  getDataTypeSummary(data: InstanceData[]): string {
    const firstData = data[0];
    if (!firstData) {
      return "";
    }

    const typeName = ImpowerGameInspector.instance
      .getInspector(firstData.reference)
      .getName();

    return `${typeName}`;
  }

  getDataListSummary(data: InstanceData[]): string {
    const firstData = data[0];
    if (!firstData) {
      return "";
    }

    const firstName = ImpowerGameInspector.instance
      .getInspector(firstData.reference)
      .getName(firstData);
    const count = data.length;
    const suffix = count > 1 ? ` +${count} more` : ``;

    return `${firstName}${suffix}`;
  }

  getContainerTargetIds<D extends InstanceData>(data: D): string[] {
    const inspector = this.getInspector(data.reference);
    if (isBranchable<D>(inspector)) {
      return inspector.getContainerTargetNames(data);
    }
    return [];
  }

  getChangedInstances(
    data: InstanceData[],
    project: GameProjectData
  ): {
    updated: { [refId: string]: InstanceData };
    original: { [refId: string]: InstanceData };
  } {
    const original: { [refId: string]: InstanceData } = {};
    const updated: { [refId: string]: InstanceData } = {};
    data.forEach((d) => {
      const current = getData(d.reference, project);
      if (!current || JSON.stringify(current) !== JSON.stringify(d)) {
        updated[d.reference.refId] = d;
        original[d.reference.refId] = current as InstanceData;
      }
    });
    return { updated, original };
  }

  validateData(
    project: GameProjectData,
    data: InstanceData[]
  ): {
    updated: { [refId: string]: InstanceData };
    original: { [refId: string]: InstanceData };
  } {
    const firstNewData = data[0];
    const newValidatedDataList: InstanceData[] = [];
    const allSiblings = getAllData(
      Permission.None,
      project,
      firstNewData.reference
    );
    Object.values(data).forEach((newD) => {
      const inspector = this.getInspector(newD.reference);
      let validatedD = inspector.validate({ ...newD });
      const visiblePropertyPaths = getAllVisiblePropertyPaths(
        validatedD,
        inspector.isPropertyVisible,
        inspector.createData
      );
      visiblePropertyPaths.forEach((propertyPath) => {
        const value = getValue(validatedD, propertyPath);
        if (isReference(value) && value.refId) {
          const data = getData(value, project);
          if (!data) {
            // This is a reference to an instance that has been deleted from the project
            // So remove the reference
            validatedD = setValue(validatedD, propertyPath, {
              ...value,
              refId: "",
            });
          }
        }
      });
      if (isNameable(validatedD)) {
        const otherNames = Object.values(allSiblings)
          .filter(
            (d) =>
              (d as InstanceData)?.reference?.refId !==
              (validatedD as InstanceData)?.reference?.refId
          )
          .map((d) => (isNameable(d) ? d.name : ""));
        validatedD.name = getUniqueName(otherNames, validatedD.name);
      }
      newValidatedDataList.push(validatedD);
      allSiblings[validatedD.reference.refId] = validatedD;
    });
    return this.getChangedInstances(newValidatedDataList, project);
  }
}
