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
  ElementTypeId,
  GameProjectData,
  InstanceData,
  isBranchable,
  isContainerReference,
  isDynamicData,
  isItemReference,
  isReference,
  isScopable,
  isVariableReference,
  Permission,
  Reference,
  TriggerTypeId,
  TypeLookup,
  VariableData,
  VariableLifetime,
  VariableTypeId,
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
import { ConstructInspector } from "../../project/classes/instances/containers/construct/constructInspector";
import { CommandInspector } from "../../project/classes/instances/items/command/commandInspector";
import { PauseAudioCommandInspector } from "../../project/classes/instances/items/commands/audio/pauseAudioCommand/pauseAudioCommandInspector";
import { PlayAudioCommandInspector } from "../../project/classes/instances/items/commands/audio/playAudioCommand/playAudioCommandInspector";
import { ResumeAudioCommandInspector } from "../../project/classes/instances/items/commands/audio/resumeAudioCommand/resumeAudioCommandInspector";
import { StopAudioCommandInspector } from "../../project/classes/instances/items/commands/audio/stopAudioCommand/stopAudioCommandInspector";
import { CloseCommandInspector } from "../../project/classes/instances/items/commands/conditonal/closeCommand/closeCommandInspector";
import { ElseCommandInspector } from "../../project/classes/instances/items/commands/conditonal/elseCommand/elseCommandInspector";
import { ElseIfCommandInspector } from "../../project/classes/instances/items/commands/conditonal/elseIfCommand/elseIfCommandInspector";
import { IfCommandInspector } from "../../project/classes/instances/items/commands/conditonal/ifCommand/ifCommandInspector";
import { SelectCommandInspector } from "../../project/classes/instances/items/commands/conditonal/selectCommand/selectCommandInspector";
import { SetCommandInspector } from "../../project/classes/instances/items/commands/data/setCommand/setCommandInspector";
import { DisplayCommandInspector } from "../../project/classes/instances/items/commands/dialog/displayCommand/displayCommandInspector";
import { CreateCommandInspector } from "../../project/classes/instances/items/commands/entity/createCommand/createCommandInspector";
import { DestroyCommandInspector } from "../../project/classes/instances/items/commands/entity/destroyCommand/destroyCommandInspector";
import { ShowPortraitCommandInspector } from "../../project/classes/instances/items/commands/entity/showPortraitCommand/showPortraitCommandInspector";
import { DoCommandInspector } from "../../project/classes/instances/items/commands/flow/doCommand/doCommandInspector";
import { EndCommandInspector } from "../../project/classes/instances/items/commands/flow/endCommand/endCommandInspector";
import { EnterCommandInspector } from "../../project/classes/instances/items/commands/flow/enterCommand/enterCommandInspector";
import { ExitCommandInspector } from "../../project/classes/instances/items/commands/flow/exitCommand/exitCommandInspector";
import { LogCommandInspector } from "../../project/classes/instances/items/commands/flow/logCommand/logCommandInspector";
import { WaitCommandInspector } from "../../project/classes/instances/items/commands/flow/waitCommand/waitCommandInspector";
import { HideImageCommandInspector } from "../../project/classes/instances/items/commands/image/hideImageCommand/hideImageCommandInspector";
import { MoveToImageCommandInspector } from "../../project/classes/instances/items/commands/image/moveToImageCommand/moveToImageCommandInspector";
import { RotateToImageCommandInspector } from "../../project/classes/instances/items/commands/image/rotateImageCommand/rotateImageCommandInspector";
import { ScaleToImageCommandInspector } from "../../project/classes/instances/items/commands/image/scaleImageCommand/scaleImageCommandInspector";
import { ShowImageCommandInspector } from "../../project/classes/instances/items/commands/image/showImageCommand/showImageCommandInspector";
import { ElementInspector } from "../../project/classes/instances/items/element/elementInspector";
import { CloseElementInspector } from "../../project/classes/instances/items/elements/ui/closeElement/closeElementInspector";
import { ComponentElementInspector } from "../../project/classes/instances/items/elements/ui/componentElement/componentElementInspector";
import { GroupElementInspector } from "../../project/classes/instances/items/elements/ui/groupElement/groupElementInspector";
import { ImageElementInspector } from "../../project/classes/instances/items/elements/ui/imageElement/imageElementInspector";
import { ShapeElementInspector } from "../../project/classes/instances/items/elements/ui/shapeElement/shapeElementInspector";
import { TextElementInspector } from "../../project/classes/instances/items/elements/ui/textElement/textElementInspector";
import { TriggerInspector } from "../../project/classes/instances/items/trigger/triggerInspector";
import { AllTriggerInspector } from "../../project/classes/instances/items/triggers/conditional/allTrigger/allTriggerInspector";
import { AnyTriggerInspector } from "../../project/classes/instances/items/triggers/conditional/anyTrigger/anyTriggerInspector";
import { CloseTriggerInspector } from "../../project/classes/instances/items/triggers/conditional/closeTrigger/closeTriggerInspector";
import { CompareTriggerInspector } from "../../project/classes/instances/items/triggers/conditional/compareTrigger/compareTriggerInspector";
import { EnteredTriggerInspector } from "../../project/classes/instances/items/triggers/flow/enteredTrigger/enteredTriggerInspector";
import { PausedTriggerInspector } from "../../project/classes/instances/items/triggers/flow/pausedTrigger/pausedTriggerInspector";
import { ReturnedTriggerInspector } from "../../project/classes/instances/items/triggers/flow/returnedTrigger/returnedTriggerInspector";
import { ClickTriggerInspector } from "../../project/classes/instances/items/triggers/input/click/clickTriggerInspector";
import { ImageClickTriggerInspector } from "../../project/classes/instances/items/triggers/input/imageClick/imageClickTriggerInspector";
import { ImageDragTriggerInspector } from "../../project/classes/instances/items/triggers/input/imageDrag/imageDragTriggerInspector";
import { ImageDropTriggerInspector } from "../../project/classes/instances/items/triggers/input/imageDrop/imageDropTriggerInspector";
import { ImageHoverTriggerInspector } from "../../project/classes/instances/items/triggers/input/imageHover/imageHoverTriggerInspector";
import { PressedKeyTriggerInspector } from "../../project/classes/instances/items/triggers/input/pressedKey/pressedKeyTriggerInspector";
import { VariableInspector } from "../../project/classes/instances/items/variable/variableInspector";
import { AudioVariableInspector } from "../../project/classes/instances/items/variables/audioVariable/audioVariableInspector";
import { BlockVariableInspector } from "../../project/classes/instances/items/variables/blockVariable/blockVariableInspector";
import { BooleanVariableInspector } from "../../project/classes/instances/items/variables/booleanVariable/booleanVariableInspector";
import { ColorVariableInspector } from "../../project/classes/instances/items/variables/colorVariable/colorVariableInspector";
import { ConstructVariableInspector } from "../../project/classes/instances/items/variables/constructVariable/constructVariableInspector";
import { ImageVariableInspector } from "../../project/classes/instances/items/variables/imageVariable/imageVariableInspector";
import { NumberVariableInspector } from "../../project/classes/instances/items/variables/numberVariable/numberVariableInspector";
import { StringVariableInspector } from "../../project/classes/instances/items/variables/stringVariable/stringVariableInspector";
import { TextVariableInspector } from "../../project/classes/instances/items/variables/textVariable/textVariableInspector";
import { Vector2VariableInspector } from "../../project/classes/instances/items/variables/vector2Variable/vector2VariableInspector";
import { VideoVariableInspector } from "../../project/classes/instances/items/variables/videoVariable/videoVariableInspector";
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

  private _constructInspectors: {
    [refTypeId in "Construct"]: ConstructInspector;
  } = {
    Construct: ConstructInspector.instance,
  };

  private _blockInspectors: {
    [refTypeId in "Block"]: BlockInspector;
  } = {
    Block: BlockInspector.instance,
  };

  private _elementInspectors: {
    [refTypeId in ElementTypeId]: ElementInspector;
  } = {
    GroupElement: new GroupElementInspector(),
    CloseElement: new CloseElementInspector(),
    ComponentElement: new ComponentElementInspector(),
    TextElement: new TextElementInspector(),
    ImageElement: new ImageElementInspector(),
    ShapeElement: new ShapeElementInspector(),
  };

  private _triggerInspectors: {
    [refTypeId in TriggerTypeId]: TriggerInspector;
  } = {
    EnteredTrigger: new EnteredTriggerInspector(),
    ReturnedTrigger: new ReturnedTriggerInspector(),
    PausedTrigger: new PausedTriggerInspector(),
    AllTrigger: new AllTriggerInspector(),
    AnyTrigger: new AnyTriggerInspector(),
    CloseTrigger: new CloseTriggerInspector(),
    CompareTrigger: new CompareTriggerInspector(),
    PressedKeyTrigger: new PressedKeyTriggerInspector(),
    ClickTrigger: new ClickTriggerInspector(),
    ImageClickTrigger: new ImageClickTriggerInspector(),
    ImageHoverTrigger: new ImageHoverTriggerInspector(),
    ImageDragTrigger: new ImageDragTriggerInspector(),
    ImageDropTrigger: new ImageDropTriggerInspector(),
  };

  private _commandInspectors: {
    [refTypeId in CommandTypeId]: CommandInspector;
  } = {
    LogCommand: new LogCommandInspector(),
    DoCommand: new DoCommandInspector(),
    EnterCommand: new EnterCommandInspector(),
    ExitCommand: new ExitCommandInspector(),
    EndCommand: new EndCommandInspector(),
    WaitCommand: new WaitCommandInspector(),
    IfCommand: new IfCommandInspector(),
    ElseIfCommand: new ElseIfCommandInspector(),
    ElseCommand: new ElseCommandInspector(),
    SelectCommand: new SelectCommandInspector(),
    CloseCommand: new CloseCommandInspector(),
    SetCommand: new SetCommandInspector(),
    DisplayCommand: new DisplayCommandInspector(),
    CreateCommand: new CreateCommandInspector(),
    DestroyCommand: new DestroyCommandInspector(),
    ShowPortraitCommand: new ShowPortraitCommandInspector(),
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

  private _variableInspectors: {
    [refTypeId in VariableTypeId]: VariableInspector;
  } = {
    BooleanVariable: new BooleanVariableInspector(),
    NumberVariable: new NumberVariableInspector(),
    StringVariable: new StringVariableInspector(),
    ColorVariable: new ColorVariableInspector(),
    Vector2Variable: new Vector2VariableInspector(),
    ConstructVariable: new ConstructVariableInspector(),
    BlockVariable: new BlockVariableInspector(),
    ImageVariable: new ImageVariableInspector(),
    AudioVariable: new AudioVariableInspector(),
    VideoVariable: new VideoVariableInspector(),
    TextVariable: new TextVariableInspector(),
  };

  registerConfigInspector(refTypeId: string, inspector: ConfigInspector): void {
    this._configInspectors[refTypeId] = inspector;
  }

  unregisterConfigInspector(refTypeId: string): void {
    delete this._configInspectors[refTypeId];
  }

  registerConstructInspector(
    refTypeId: string,
    inspector: ConstructInspector
  ): void {
    this._constructInspectors[refTypeId] = inspector;
  }

  unregisterConstructInspector(refTypeId: string): void {
    delete this._constructInspectors[refTypeId];
  }

  registerBlockInspector(refTypeId: string, inspector: BlockInspector): void {
    this._blockInspectors[refTypeId] = inspector;
  }

  unregisterBlockInspector(refTypeId: string): void {
    delete this._blockInspectors[refTypeId];
  }

  registerElementInspector(
    refTypeId: string,
    inspector: ElementInspector
  ): void {
    this._elementInspectors[refTypeId] = inspector;
  }

  unregisterElementInspector(refTypeId: string): void {
    delete this._elementInspectors[refTypeId];
  }

  registerTriggerInspector(
    refTypeId: string,
    inspector: TriggerInspector
  ): void {
    this._triggerInspectors[refTypeId] = inspector;
  }

  unregisterTriggerInspector(refTypeId: string): void {
    delete this._triggerInspectors[refTypeId];
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

  registerVariableInspector(
    refTypeId: string,
    inspector: VariableInspector
  ): void {
    this._variableInspectors[refTypeId] = inspector;
  }

  unregisterVariableInspector(refTypeId: string): void {
    delete this._variableInspectors[refTypeId];
  }

  getInspectors<
    T extends
      | ConfigInspector
      | ConstructInspector
      | BlockInspector
      | VariableInspector
      | TriggerInspector
      | CommandInspector
  >(type: DataType): { [refTypeId: string]: T } {
    switch (type) {
      case "Config": {
        return this._configInspectors as unknown as {
          [refTypeId: string]: T;
        };
      }
      case "Construct": {
        return this._constructInspectors as unknown as {
          [refTypeId: string]: T;
        };
      }
      case "Block": {
        return this._blockInspectors as unknown as { [refTypeId: string]: T };
      }
      case "Element": {
        return this._elementInspectors as unknown as {
          [refTypeId: string]: T;
        };
      }
      case "Variable": {
        return this._variableInspectors as unknown as {
          [refTypeId: string]: T;
        };
      }
      case "Trigger": {
        return this._triggerInspectors as unknown as {
          [refTypeId: string]: T;
        };
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
      case "Construct": {
        return ConstructInspector.instance;
      }
      case "Block": {
        return BlockInspector.instance;
      }
      case "Element": {
        return ElementInspector.instance;
      }
      case "Variable": {
        return VariableInspector.instance;
      }
      case "Trigger": {
        return TriggerInspector.instance;
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
    data: D,
    project: GameProjectData
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
        if (isReference(value)) {
          argString = this.getReferenceName(value, project);
        } else if (
          isDynamicData(value) &&
          !value.dynamic &&
          isReference(value.constant)
        ) {
          argString = this.getReferenceName(value.constant, project);
        } else if (isDynamicData(value) && value.dynamic) {
          argString = this.getReferenceName(value.dynamic, project);
        } else if (isDynamicData(value) && !value.dynamic) {
          argString = inspector.getPropertyDisplayValue(
            `${arg}.constant`,
            data,
            value.constant
          );
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
      return inspector.getContainerTargetIds(data);
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
    const { parentContainerId } = firstNewData.reference;
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
        if (
          isVariableReference(value) &&
          value.refId &&
          inspector.getPropertyPermission(propertyPath, validatedD) ===
            Permission.Set
        ) {
          const variableData = getData(value, project) as VariableData;
          if (variableData.lifetime === VariableLifetime.Constant) {
            // This is a setter reference to a variable which is not allowed to be set
            // So remove the reference
            validatedD = setValue(validatedD, propertyPath, {
              ...value,
              refId: "",
            });
          }
        }
      });
      if (isScopable(validatedD)) {
        if (
          isItemReference(validatedD.reference) ||
          isContainerReference(validatedD.reference)
        ) {
          if (
            validatedD.reference.parentContainerId !== parentContainerId &&
            !(validatedD.reference.refId in allSiblings)
          ) {
            const overriddenData = { ...validatedD };
            validatedD.overrideParentContainerId =
              validatedD.reference.parentContainerId;
            newValidatedDataList.push(overriddenData);
          }
        }
      }
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
