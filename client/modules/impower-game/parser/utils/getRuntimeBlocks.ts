import {
  FountainAsset,
  FountainSection,
  FountainVariable,
} from "../../../impower-script-parser";
import {
  BlockData,
  createBlockData,
  createBlockReference,
  createTriggerData,
  createTriggerReference,
} from "../../data";
import { getRuntimeCommand } from "./getRuntimeCommand";
import { getRuntimeTrigger } from "./getRuntimeTrigger";
import { getRuntimeVariable } from "./getRuntimeVariable";

export const getRuntimeBlocks = (
  sections: Record<string, FountainSection>,
  variables: Record<string, FountainVariable>,
  assets: Record<string, FountainAsset>
): Record<string, BlockData> => {
  const blocks: { [refId: string]: BlockData } = {};
  if (!sections) {
    return blocks;
  }
  Object.entries(sections).forEach(([sectionId, section]) => {
    const defaultTriggerId = `${sectionId}.${section.start}-triggerable`;
    const defaultTriggers = section.operator
      ? {
          order: [defaultTriggerId],
          data: {
            [defaultTriggerId]: createTriggerData({
              reference: createTriggerReference({
                parentContainerId: sectionId,
                refId: defaultTriggerId,
                refTypeId: "AnyTrigger",
              }),
              pos: section.start,
              line: section.line,
            }),
          },
        }
      : {
          order: [],
          data: {},
        };
    const block = createBlockData({
      reference: createBlockReference({
        parentContainerId: sectionId.split(".").slice(0, -1).join("."),
        refId: sectionId,
      }),
      pos: section.start,
      line: section.line,
      name: section.name,
      triggers: defaultTriggers,
      childContainerIds: section.children || [],
    });
    section.tokens.forEach((token) => {
      const runtimeVariable = getRuntimeVariable(token, sectionId, variables);
      if (runtimeVariable) {
        block.variables.order.push(runtimeVariable.reference.refId);
        block.variables.data[runtimeVariable.reference.refId] = runtimeVariable;
      }
      const runtimeTrigger = getRuntimeTrigger(token, sectionId, variables);
      if (runtimeTrigger) {
        block.triggers.order.push(runtimeTrigger.reference.refId);
        block.triggers.data[runtimeTrigger.reference.refId] = runtimeTrigger;
      }
      const runtimeCommand = getRuntimeCommand(
        token,
        sectionId,
        variables,
        assets
      );
      if (runtimeCommand) {
        block.commands.order.push(runtimeCommand.reference.refId);
        block.commands.data[runtimeCommand.reference.refId] = runtimeCommand;
      }
    });
    blocks[sectionId] = block;
  });

  return blocks;
};
