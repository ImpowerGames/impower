import { parseFountain } from "../../../impower-script-parser";
import { BlockData, ConstructData } from "../../data";
import { ImpowerGameRunner } from "../../runner/classes/impowerGameRunner";
import { FileData } from "./instances/file/fileData";
import { CommandData } from "./instances/items/command/commandData";
import { CommandRunner } from "./instances/items/command/commandRunner";
import { ElementData } from "./instances/items/element/elementData";
import { TriggerData } from "./instances/items/trigger/triggerData";
import { TriggerRunner } from "./instances/items/trigger/triggerRunner";
import { VariableData } from "./instances/items/variable/variableData";
import { GameProjectData } from "./project/gameProjectData";

export class ImpowerDataMap {
  private _files: { [refId: string]: FileData };

  private _constructs: { [refId: string]: ConstructData };

  private _elements: { [refId: string]: ElementData };

  private _variables: { [refId: string]: VariableData };

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

  public get files(): { [refId: string]: FileData } {
    return this._files;
  }

  public get constructs(): { [refId: string]: ConstructData } {
    return this._constructs;
  }

  public get elements(): { [refId: string]: ElementData } {
    return this._elements;
  }

  public get variables(): { [refId: string]: VariableData } {
    return this._variables;
  }

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
    this._files = { ...(project?.instances?.files?.data || {}) };
    this._constructs = {};
    this._variables = {};
    this._elements = {};
    this._blockInternalRunners = {};

    const script = project?.scripts?.logic?.data?.root;
    const constructs: { [refId: string]: ConstructData } = {};
    const blocks: { [refId: string]: BlockData } = {};
    if (script) {
      const syntaxTree = parseFountain(script);
      const tokens = syntaxTree.scriptTokens;
      const startTokenIndex =
        syntaxTree.scriptTokenLines[syntaxTree.properties.firstTokenLine];
      console.log(syntaxTree);
      for (let i = startTokenIndex; i < tokens.length; i += 1) {
        const token = tokens[i];
      }
    }

    Object.values(constructs).forEach((construct) => {
      this._constructs[construct.reference.refId] = construct;
      Object.values(construct.variables?.data || {}).forEach((variable) => {
        this._variables[variable.reference.refId] = variable;
      });
      Object.values(construct.elements?.data || {}).forEach((element) => {
        this._elements[element.reference.refId] = element;
      });
    });

    Object.values(blocks).forEach((block) => {
      this._blockInternalRunners[block.reference.refId] = {
        triggers: runner.getIterableRunners(block.triggers),
        commands: runner.getIterableRunners(block.commands),
      };
      Object.values(block.variables?.data || {}).forEach((variable) => {
        this._variables[variable.reference.refId] = variable;
      });
    });
  }
}
