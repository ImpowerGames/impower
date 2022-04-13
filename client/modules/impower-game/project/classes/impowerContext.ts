import {
  getScopedEvaluationContext,
  parseSpark,
} from "../../../impower-script-parser";
import { CommandData, GameProjectData } from "../../data";
import { getRuntimeBlocks, getScriptAugmentations } from "../../parser";
import { CommandRunner, ImpowerGameRunner } from "../../runner";

interface CommandRuntimeData {
  runner: CommandRunner;
  data: CommandData;
}

export class ImpowerContext {
  private _contexts: {
    [id: string]: {
      ids: Record<string, string>;
      valueMap: Record<string, unknown>;
      triggers: string[];
      parameters: string[];
      commands: CommandRuntimeData[];
    };
  };

  public get contexts(): {
    [id: string]: {
      ids: Record<string, string>;
      valueMap: Record<string, unknown>;
      triggers: string[];
      parameters: string[];
      commands: CommandRuntimeData[];
    };
  } {
    return this._contexts;
  }

  constructor(project: GameProjectData, runner: ImpowerGameRunner) {
    const script = project?.scripts?.data?.logic;
    const result = parseSpark(
      script,
      getScriptAugmentations(project?.files?.data)
    );
    const runtimeBlocks = getRuntimeBlocks(result);

    this._contexts = {};

    Object.entries(runtimeBlocks).forEach(([blockId, block]) => {
      const [ids, valueMap] = getScopedEvaluationContext(
        blockId,
        result?.sections,
        result?.entities
      );
      this._contexts[block.reference.refId] = {
        ids,
        valueMap,
        triggers: block.triggers,
        parameters: block.parameters,
        commands: runner.getRuntimeData(block.commands),
      };
    });
  }
}
