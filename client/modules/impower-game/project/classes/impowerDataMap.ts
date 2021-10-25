import { ElementData } from "./instances/items/element/elementData";
import { VariableData } from "./instances/items/variable/variableData";
import { GameProjectData } from "./project/gameProjectData";
import { TriggerData } from "./instances/items/trigger/triggerData";
import { TriggerRunner } from "./instances/items/trigger/triggerRunner";
import { CommandRunner } from "./instances/items/command/commandRunner";
import { CommandData } from "./instances/items/command/commandData";
import { ImpowerGameRunner } from "../../runner/classes/impowerGameRunner";
import { BlockData, ConstructData } from "../../data";
import { FileData } from "./instances/file/fileData";

export class ImpowerDataMap {
  private _files: { [refId: string]: FileData };

  public get files(): { [refId: string]: FileData } {
    return this._files;
  }

  private _constructs: { [refId: string]: ConstructData };

  public get constructs(): { [refId: string]: ConstructData } {
    return this._constructs;
  }

  private _blocks: { [refId: string]: BlockData };

  public get blocks(): { [refId: string]: BlockData } {
    return this._blocks;
  }

  private _elements: { [refId: string]: ElementData };

  public get elements(): { [refId: string]: ElementData } {
    return this._elements;
  }

  private _variables: { [refId: string]: VariableData };

  public get variables(): { [refId: string]: VariableData } {
    return this._variables;
  }

  private _blockInternalRunners: {
    [refId: string]: {
      triggers: {
        runner: TriggerRunner;
        data: TriggerData;
        level: number;
      }[];
      commands: {
        runner: CommandRunner;
        data: CommandData;
        level: number;
      }[];
    };
  };

  public get blockInternalRunners(): {
    [refId: string]: {
      triggers: {
        runner: TriggerRunner;
        data: TriggerData;
        level: number;
      }[];
      commands: {
        runner: CommandRunner;
        data: CommandData;
        level: number;
      }[];
    };
  } {
    return this._blockInternalRunners;
  }

  constructor(project: GameProjectData, runner: ImpowerGameRunner) {
    this._files = { ...project.instances.files.data };
    this._constructs = {};
    this._variables = {};
    this._elements = {};
    this._blocks = {};
    this._blockInternalRunners = {};

    Object.values(project.instances.constructs.data).forEach((construct) => {
      this._constructs[construct.reference.refId] = construct;
      Object.values(construct.variables.data).forEach((variable) => {
        this._variables[variable.reference.refId] = variable;
      });
      Object.values(construct.elements.data).forEach((element) => {
        this._elements[element.reference.refId] = element;
      });
    });

    Object.values(project.instances.blocks.data).forEach((block) => {
      this._blocks[block.reference.refId] = block;
      this._blockInternalRunners[block.reference.refId] = {
        triggers: runner.getIterableRunners(block.triggers),
        commands: runner.getIterableRunners(block.commands),
      };
      Object.values(block.variables.data).forEach((variable) => {
        this._variables[variable.reference.refId] = variable;
      });
    });
  }
}
