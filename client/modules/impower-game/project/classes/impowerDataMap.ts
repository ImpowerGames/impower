import { parseFountain } from "../../../impower-script-parser";
import { ConstructData } from "../../data";
import { getRuntimeBlocks } from "../../parser";
import { ImpowerGameRunner } from "../../runner/classes/impowerGameRunner";
import { FileData } from "./instances/file/fileData";
import { CommandData } from "./instances/items/command/commandData";
import { CommandRunner } from "./instances/items/command/commandRunner";
import { ElementData } from "./instances/items/element/elementData";
import { TriggerData } from "./instances/items/trigger/triggerData";
import { TriggerRunner } from "./instances/items/trigger/triggerRunner";
import { VariableValue } from "./instances/items/variable/variableValue";
import { GameProjectData } from "./project/gameProjectData";

export class ImpowerDataMap {
  private _files: { [refId: string]: FileData };

  private _constructs: { [refId: string]: ConstructData };

  private _elements: { [refId: string]: ElementData };

  private _variables: { [id: string]: VariableValue };

  private _blockTriggers: {
    [refId: string]: {
      runner: TriggerRunner;
      data: TriggerData;
      level: number;
    }[];
  };

  private _blockCommands: {
    [refId: string]: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[];
  };

  public get files(): { [refId: string]: FileData } {
    return this._files;
  }

  public get constructs(): { [refId: string]: ConstructData } {
    return this._constructs;
  }

  public get elements(): { [refId: string]: ElementData } {
    return this._elements;
  }

  public get variables(): { [id: string]: VariableValue } {
    return this._variables;
  }

  public get blockTriggers(): {
    [refId: string]: {
      runner: TriggerRunner;
      data: TriggerData;
      level: number;
    }[];
  } {
    return this._blockTriggers;
  }

  public get blockCommands(): {
    [refId: string]: {
      runner: CommandRunner;
      data: CommandData;
      level: number;
    }[];
  } {
    return this._blockCommands;
  }

  constructor(project: GameProjectData, runner: ImpowerGameRunner) {
    const script = project?.scripts?.logic?.data?.root;
    const result = parseFountain(script);
    const runtimeBlocks = getRuntimeBlocks(result?.sections, result?.variables);
    const runtimeFiles = project?.instances?.files?.data;
    const constructs: { [id: string]: ConstructData } = {};

    this._files = runtimeFiles;
    this._constructs = {};
    this._variables = {};
    this._elements = {};
    this._blockTriggers = {};
    this._blockCommands = {};

    Object.values(constructs).forEach((construct) => {
      this._constructs[construct.reference.refId] = construct;
      Object.values(construct.variables?.data || {}).forEach((variable) => {
        this._variables[variable.reference.refId] = {
          type:
            variable.reference.refTypeId === "NumberVariable"
              ? "number"
              : "string",
          value: variable.value,
        };
      });
      Object.values(construct.elements?.data || {}).forEach((element) => {
        this._elements[element.reference.refId] = element;
      });
    });

    Object.values(runtimeBlocks).forEach((block) => {
      this._blockTriggers[block.reference.refId] = runner.getIterableRunners(
        block.triggers
      );
      this._blockCommands[block.reference.refId] = runner.getIterableRunners(
        block.commands
      );
      Object.values(block.variables?.data || {}).forEach((variable) => {
        this._variables[variable.reference.refId] = {
          type:
            variable.reference.refTypeId === "NumberVariable"
              ? "number"
              : "string",
          value: variable.value,
        };
      });
    });
  }
}
