import { Compiler } from "../../../impower-script-compiler";
import { Story } from "../../../impower-script-engine";
import { parseFountain } from "../../../impower-script-parser";
import { BlockData, ConstructData } from "../../data";
import { ImpowerGameRunner } from "../../runner/classes/impowerGameRunner";
import { FileData } from "./instances/file/fileData";
import { ElementData } from "./instances/items/element/elementData";
import { VariableData } from "./instances/items/variable/variableData";
import { GameProjectData } from "./project/gameProjectData";

export class ImpowerDataMap {
  private _runner: ImpowerGameRunner;

  private _compiler: Compiler = new Compiler();

  private _files: { [refId: string]: FileData };

  private _constructs: { [refId: string]: ConstructData };

  private _blocks: { [refId: string]: BlockData };

  private _elements: { [refId: string]: ElementData };

  private _variables: { [refId: string]: VariableData };

  private _scripts: Record<string, Story> = {};

  public get files(): { [refId: string]: FileData } {
    return this._files;
  }

  public get constructs(): { [refId: string]: ConstructData } {
    return this._constructs;
  }

  public get blocks(): { [refId: string]: BlockData } {
    return this._blocks;
  }

  public get elements(): { [refId: string]: ElementData } {
    return this._elements;
  }

  public get variables(): { [refId: string]: VariableData } {
    return this._variables;
  }

  public get scripts(): Record<string, Story> {
    return this._scripts;
  }

  constructor(project: GameProjectData, runner: ImpowerGameRunner) {
    this._runner = runner;
    this._files = { ...(project?.instances?.files?.data || {}) };
    this._constructs = {};
    this._variables = {};
    this._elements = {};
    this._blocks = {};

    Object.values(project?.instances?.constructs?.data || {}).forEach(
      (construct) => {
        this._constructs[construct.reference.refId] = construct;
        Object.values(construct.variables?.data || {}).forEach((variable) => {
          this._variables[variable.reference.refId] = variable;
        });
        Object.values(construct.elements?.data || {}).forEach((element) => {
          this._elements[element.reference.refId] = element;
        });
      }
    );

    Object.values(project?.instances?.blocks?.data || {}).forEach((block) => {
      this._blocks[block.reference.refId] = block;
      Object.values(block.variables?.data || {}).forEach((variable) => {
        this._variables[variable.reference.refId] = variable;
      });
      const { script } = block;
      if (script) {
        console.log(parseFountain(script));
        // const story = this._compiler.Compile(script);
        // this._scripts[block.reference.refId] = story;
      }
    });
  }
}
