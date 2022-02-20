import { OrderedCollection } from "../../../impower-core";
import {
  CommandTypeId,
  ConfigTypeId,
  DataType,
  ElementTypeId,
  InstanceData,
  TriggerTypeId,
  TypeLookup,
  VariableTypeId,
} from "../../data";
import { InstanceRunner } from "../../project/classes/instance/instanceRunner";
import { ConfigRunner } from "../../project/classes/instances/config/configRunner";
import { BlockRunner } from "../../project/classes/instances/containers/block/blockRunner";
import { ConstructRunner } from "../../project/classes/instances/containers/construct/constructRunner";
import { CommandRunner } from "../../project/classes/instances/items/command/commandRunner";
import { PauseAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/pauseAudioCommand/pauseAudioCommandRunner";
import { PlayAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/playAudioCommand/playAudioCommandRunner";
import { ResumeAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/resumeAudioCommand/resumeAudioCommandRunner";
import { StopAudioCommandRunner } from "../../project/classes/instances/items/commands/audio/stopAudioCommand/stopAudioCommandRunner";
import { CloseCommandRunner } from "../../project/classes/instances/items/commands/conditonal/closeCommand/closeCommandRunner";
import { ElseCommandRunner } from "../../project/classes/instances/items/commands/conditonal/elseCommand/elseCommandRunner";
import { ElseIfCommandRunner } from "../../project/classes/instances/items/commands/conditonal/elseIfCommand/elseIfCommandRunner";
import { IfCommandRunner } from "../../project/classes/instances/items/commands/conditonal/ifCommand/ifCommandRunner";
import { SelectCommandRunner } from "../../project/classes/instances/items/commands/conditonal/selectCommand/selectCommandRunner";
import { SetCommandRunner } from "../../project/classes/instances/items/commands/data/setCommand/setCommandRunner";
import { SayCommandRunner } from "../../project/classes/instances/items/commands/dialog/sayCommand/sayCommandRunner";
import { CreateCommandRunner } from "../../project/classes/instances/items/commands/entity/createCommand/createCommandRunner";
import { DestroyCommandRunner } from "../../project/classes/instances/items/commands/entity/destroyCommand/destroyCommandRunner";
import { ShowPortraitCommandRunner } from "../../project/classes/instances/items/commands/entity/showPortraitCommand/showPortraitCommandRunner";
import { DoCommandRunner } from "../../project/classes/instances/items/commands/flow/doCommand/doCommandRunner";
import { EndCommandRunner } from "../../project/classes/instances/items/commands/flow/endCommand/endCommandRunner";
import { EnterCommandRunner } from "../../project/classes/instances/items/commands/flow/enterCommand/enterCommandRunner";
import { ExitCommandRunner } from "../../project/classes/instances/items/commands/flow/exitCommand/exitCommandRunner";
import { LogCommandRunner } from "../../project/classes/instances/items/commands/flow/logCommand/logCommandRunner";
import { WaitCommandRunner } from "../../project/classes/instances/items/commands/flow/waitCommand/waitCommandRunner";
import { HideImageCommandRunner } from "../../project/classes/instances/items/commands/image/hideImageCommand/hideImageCommandRunner";
import { MoveToImageCommandRunner } from "../../project/classes/instances/items/commands/image/moveToImageCommand/moveToImageCommandRunner";
import { RotateToImageCommandRunner } from "../../project/classes/instances/items/commands/image/rotateImageCommand/rotateImageCommandRunner";
import { ScaleToImageCommandRunner } from "../../project/classes/instances/items/commands/image/scaleImageCommand/scaleImageCommandRunner";
import { ShowImageCommandRunner } from "../../project/classes/instances/items/commands/image/showImageCommand/showImageCommandRunner";
import { ElementRunner } from "../../project/classes/instances/items/element/elementRunner";
import { CloseElementRunner } from "../../project/classes/instances/items/elements/ui/closeElement/closeElementRunner";
import { ComponentElementRunner } from "../../project/classes/instances/items/elements/ui/componentElement/componentElementRunner";
import { GroupElementRunner } from "../../project/classes/instances/items/elements/ui/groupElement/groupElementRunner";
import { ImageElementRunner } from "../../project/classes/instances/items/elements/ui/imageElement/imageElementRunner";
import { ShapeElementRunner } from "../../project/classes/instances/items/elements/ui/shapeElement/shapeElementRunner";
import { TextElementRunner } from "../../project/classes/instances/items/elements/ui/textElement/textElementRunner";
import { TriggerRunner } from "../../project/classes/instances/items/trigger/triggerRunner";
import { AllTriggerRunner } from "../../project/classes/instances/items/triggers/conditional/allTrigger/allTriggerRunner";
import { AnyTriggerRunner } from "../../project/classes/instances/items/triggers/conditional/anyTrigger/anyTriggerRunner";
import { CloseTriggerRunner } from "../../project/classes/instances/items/triggers/conditional/closeTrigger/closeTriggerRunner";
import { CompareTriggerRunner } from "../../project/classes/instances/items/triggers/conditional/compareTrigger/compareTriggerRunner";
import { EnteredTriggerRunner } from "../../project/classes/instances/items/triggers/flow/enteredTrigger/enteredTriggerRunner";
import { PausedTriggerRunner } from "../../project/classes/instances/items/triggers/flow/pausedTrigger/pausedTriggerRunner";
import { ReturnedTriggerRunner } from "../../project/classes/instances/items/triggers/flow/returnedTrigger/returnedTriggerRunner";
import { ClickTriggerRunner } from "../../project/classes/instances/items/triggers/input/click/clickTriggerRunner";
import { ImageClickTriggerRunner } from "../../project/classes/instances/items/triggers/input/imageClick/imageClickTriggerRunner";
import { ImageDragTriggerRunner } from "../../project/classes/instances/items/triggers/input/imageDrag/imageDragTriggerRunner";
import { ImageDropTriggerRunner } from "../../project/classes/instances/items/triggers/input/imageDrop/imageDropTriggerRunner";
import { ImageHoverTriggerRunner } from "../../project/classes/instances/items/triggers/input/imageHover/imageHoverTriggerRunner";
import { PressedKeyTriggerRunner } from "../../project/classes/instances/items/triggers/input/pressedKey/pressedKeyTriggerRunner";
import { VariableRunner } from "../../project/classes/instances/items/variable/variableRunner";
import { AudioVariableRunner } from "../../project/classes/instances/items/variables/audioVariable/audioVariableRunner";
import { BlockVariableRunner } from "../../project/classes/instances/items/variables/blockVariable/blockVariableRunner";
import { BooleanVariableRunner } from "../../project/classes/instances/items/variables/booleanVariable/booleanVariableRunner";
import { ColorVariableRunner } from "../../project/classes/instances/items/variables/colorVariable/colorVariableRunner";
import { ConstructVariableRunner } from "../../project/classes/instances/items/variables/constructVariable/constructVariableRunner";
import { ImageVariableRunner } from "../../project/classes/instances/items/variables/imageVariable/imageVariableRunner";
import { NumberVariableRunner } from "../../project/classes/instances/items/variables/numberVariable/numberVariableRunner";
import { StringVariableRunner } from "../../project/classes/instances/items/variables/stringVariable/stringVariableRunner";
import { TextVariableRunner } from "../../project/classes/instances/items/variables/textVariable/textVariableRunner";
import { Vector2VariableRunner } from "../../project/classes/instances/items/variables/vector2Variable/vector2VariableRunner";
import { VideoVariableRunner } from "../../project/classes/instances/items/variables/videoVariable/videoVariableRunner";

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

  private _constructRunners: {
    [refTypeId in "Construct"]: ConstructRunner;
  } = {
    Construct: ConstructRunner.instance,
  };

  private _blockRunners: {
    [refTypeId in "Block"]: BlockRunner;
  } = {
    Block: BlockRunner.instance,
  };

  private _elementRunners: {
    [refTypeId in ElementTypeId]: ElementRunner;
  } = {
    GroupElement: new GroupElementRunner(),
    CloseElement: new CloseElementRunner(),
    ComponentElement: new ComponentElementRunner(),
    TextElement: new TextElementRunner(),
    ImageElement: new ImageElementRunner(),
    ShapeElement: new ShapeElementRunner(),
  };

  private _triggerRunners: {
    [refTypeId in TriggerTypeId]: TriggerRunner;
  } = {
    EnteredTrigger: new EnteredTriggerRunner(),
    ReturnedTrigger: new ReturnedTriggerRunner(),
    PausedTrigger: new PausedTriggerRunner(),
    AllTrigger: new AllTriggerRunner(),
    AnyTrigger: new AnyTriggerRunner(),
    CloseTrigger: new CloseTriggerRunner(),
    CompareTrigger: new CompareTriggerRunner(),
    PressedKeyTrigger: new PressedKeyTriggerRunner(),
    ClickTrigger: new ClickTriggerRunner(),
    ImageClickTrigger: new ImageClickTriggerRunner(),
    ImageHoverTrigger: new ImageHoverTriggerRunner(),
    ImageDragTrigger: new ImageDragTriggerRunner(),
    ImageDropTrigger: new ImageDropTriggerRunner(),
  };

  private _commandRunners: {
    [refTypeId in CommandTypeId]: CommandRunner;
  } = {
    LogCommand: new LogCommandRunner(),
    DoCommand: new DoCommandRunner(),
    EnterCommand: new EnterCommandRunner(),
    ExitCommand: new ExitCommandRunner(),
    EndCommand: new EndCommandRunner(),
    WaitCommand: new WaitCommandRunner(),
    IfCommand: new IfCommandRunner(),
    ElseIfCommand: new ElseIfCommandRunner(),
    ElseCommand: new ElseCommandRunner(),
    SelectCommand: new SelectCommandRunner(),
    CloseCommand: new CloseCommandRunner(),
    SetCommand: new SetCommandRunner(),
    SayCommand: new SayCommandRunner(),
    ShowPortraitCommand: new ShowPortraitCommandRunner(),
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

  private _variableRunners: {
    [refTypeId in VariableTypeId]: VariableRunner;
  } = {
    BooleanVariable: new BooleanVariableRunner(),
    NumberVariable: new NumberVariableRunner(),
    StringVariable: new StringVariableRunner(),
    ColorVariable: new ColorVariableRunner(),
    ConstructVariable: new ConstructVariableRunner(),
    BlockVariable: new BlockVariableRunner(),
    Vector2Variable: new Vector2VariableRunner(),
    ImageVariable: new ImageVariableRunner(),
    AudioVariable: new AudioVariableRunner(),
    VideoVariable: new VideoVariableRunner(),
    TextVariable: new TextVariableRunner(),
  };

  registerConfigRunner(refTypeId: string, inspector: ConfigRunner): void {
    this._configRunners[refTypeId] = inspector;
  }

  unregisterConfigRunner(refTypeId: string): void {
    delete this._configRunners[refTypeId];
  }

  registerConstructRunner(refTypeId: string, inspector: ConstructRunner): void {
    this._constructRunners[refTypeId] = inspector;
  }

  unregisterConstructRunner(refTypeId: string): void {
    delete this._constructRunners[refTypeId];
  }

  registerBlockRunner(refTypeId: string, inspector: BlockRunner): void {
    this._blockRunners[refTypeId] = inspector;
  }

  unregisterBlockRunner(refTypeId: string): void {
    delete this._blockRunners[refTypeId];
  }

  registerElementRunner(refTypeId: string, inspector: ElementRunner): void {
    this._elementRunners[refTypeId] = inspector;
  }

  unregisterElementRunner(refTypeId: string): void {
    delete this._elementRunners[refTypeId];
  }

  registerTriggerRunner(refTypeId: string, inspector: TriggerRunner): void {
    this._triggerRunners[refTypeId] = inspector;
  }

  unregisterTriggerRunner(refTypeId: string): void {
    delete this._triggerRunners[refTypeId];
  }

  registerCommandRunner(refTypeId: string, inspector: CommandRunner): void {
    this._commandRunners[refTypeId] = inspector;
  }

  unregisterCommandRunner(refTypeId: string): void {
    delete this._commandRunners[refTypeId];
  }

  registerVariableRunner(refTypeId: string, inspector: VariableRunner): void {
    this._variableRunners[refTypeId] = inspector;
  }

  unregisterVariableRunner(refTypeId: string): void {
    delete this._variableRunners[refTypeId];
  }

  getRunners(
    type: DataType
  ):
    | { [refTypeId: string]: ConfigRunner }
    | { [refTypeId: string]: ConstructRunner }
    | { [refTypeId: string]: BlockRunner }
    | { [refTypeId: string]: ElementRunner }
    | { [refTypeId: string]: VariableRunner }
    | { [refTypeId: string]: TriggerRunner }
    | { [refTypeId: string]: CommandRunner } {
    switch (type) {
      case "Config": {
        return this._configRunners;
      }
      case "Construct": {
        return this._constructRunners;
      }
      case "Block": {
        return this._blockRunners;
      }
      case "Element": {
        return this._elementRunners;
      }
      case "Variable": {
        return this._variableRunners;
      }
      case "Trigger": {
        return this._triggerRunners;
      }
      case "Command": {
        return this._commandRunners;
      }
      default:
        throw new Error(`'${type}' not recognized as a DataType`);
    }
  }

  getRunner(typeLookup: TypeLookup): InstanceRunner {
    const { refType, refTypeId } = typeLookup;
    const runner = this.getRunners(refType)[refTypeId];
    if (runner) {
      return runner;
    }
    switch (refType) {
      case "Config": {
        return ConfigRunner.instance;
      }
      case "Construct": {
        return ConstructRunner.instance;
      }
      case "Block": {
        return BlockRunner.instance;
      }
      case "Element": {
        return ElementRunner.instance;
      }
      case "Variable": {
        return VariableRunner.instance;
      }
      case "Trigger": {
        return TriggerRunner.instance;
      }
      case "Command": {
        return CommandRunner.instance;
      }
      default:
        throw new Error(`'${refType}' not recognized as a DataType`);
    }
  }

  getIterableRunners<D extends InstanceData, R extends InstanceRunner<D>>(
    dataList: OrderedCollection<D>
  ): { runner: R; data: D; level: number }[] {
    const iterableRunners: { runner: R; data: D; level: number }[] = [];
    let currentLevel = 0;
    let group: InstanceData;
    dataList?.order?.forEach((id) => {
      const data = dataList.data[id];
      const runner = this.getRunner(data.reference) as R;
      let level = currentLevel;
      if (runner.closesGroup(data, group)) {
        currentLevel -= 1;
        level = currentLevel;
      }
      if (runner.opensGroup(data)) {
        group = data;
        level = currentLevel;
        currentLevel += 1;
      }
      iterableRunners.push({ runner, data, level });
    });
    return iterableRunners;
  }

  getLevels(instances: InstanceData[]): { [refId: string]: number } {
    const newLevels: { [refId: string]: number } = {};
    let level = 0;
    let group: InstanceData;
    instances.forEach((item) => {
      const { refId } = item.reference;
      const data = item;
      const runner = this.getRunner(data.reference);
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
