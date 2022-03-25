import { getScopedContext, parseSpark } from "../../../impower-script-parser";
import { getRuntimeBlocks, getScriptAugmentations } from "../../parser";
import { ImpowerGameRunner } from "../../runner/classes/impowerGameRunner";
import { CommandData } from "./instances/items/command/commandData";
import { CommandRunner } from "./instances/items/command/commandRunner";
import { GameProjectData } from "./project/gameProjectData";

interface CommandRuntimeData {
  runner: CommandRunner;
  data: CommandData;
}

export class ImpowerContext {
  private _contexts: {
    [id: string]: {
      ids: Record<string, string>;
      valueMap: Record<string, unknown>;
      variables: Record<string, unknown>;
      assets: Record<string, string>;
      entities: Record<string, string>;
      tags: Record<string, string>;
      blocks: Record<string, number>;
      triggers: string[];
      parameters: string[];
      commands: CommandRuntimeData[];
    };
  };

  public get contexts(): {
    [id: string]: {
      ids: Record<string, string>;
      valueMap: Record<string, unknown>;
      variables: Record<string, unknown>;
      assets: Record<string, string>;
      entities: Record<string, string>;
      tags: Record<string, string>;
      blocks: Record<string, number>;
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
      const [variableIds, variables] = getScopedContext(
        blockId,
        result?.sections,
        "variables"
      );
      const [assetIds, assets] = getScopedContext<string>(
        blockId,
        result?.sections,
        "assets"
      );
      const [entityIds, entities] = getScopedContext<string>(
        blockId,
        result?.sections,
        "entities"
      );
      const [tagIds, tags] = getScopedContext<string>(
        blockId,
        result?.sections,
        "tags"
      );
      const [sectionIds, sections] = getScopedContext<number>(
        blockId,
        result?.sections,
        "sections"
      );
      const ids = {
        ...variableIds,
        ...assetIds,
        ...entityIds,
        ...tagIds,
        ...sectionIds,
      };
      const valueMap = {
        ...variables,
        ...assets,
        ...entities,
        ...tags,
        ...sections,
      };
      this._contexts[block.reference.refId] = {
        ids,
        valueMap,
        variables,
        assets,
        entities,
        tags,
        blocks: sections,
        triggers: block.triggers,
        parameters: block.parameters,
        commands: runner.getRuntimeData(block.commands),
      };
    });
  }
}
