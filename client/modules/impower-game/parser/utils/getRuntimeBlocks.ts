import { FountainSection } from "../../../impower-script-parser";
import { BlockData, createBlockData, createBlockReference } from "../../data";
import { getRuntimeCommand } from "./getRuntimeCommand";
import { getRuntimeTrigger } from "./getRuntimeTrigger";
import { getRuntimeVariable } from "./getRuntimeVariable";

export const getRuntimeBlocks = (
  sections: Record<string, FountainSection>
): Record<string, BlockData> => {
  const blocks: { [refId: string]: BlockData } = {};
  Object.entries(sections).forEach(([sectionId, section]) => {
    const block = createBlockData({
      reference: createBlockReference({
        parentContainerId: sectionId.split(".").slice(0, -1).join("."),
        refId: sectionId,
      }),
      line: section.line,
      name: section.name,
      childContainerIds: section.children || [],
    });
    const skip = ["character", "parenthetical"];
    section.tokens.forEach((token) => {
      if (!skip.includes(token.type)) {
        const runtimeVariable = getRuntimeVariable(token);
        if (runtimeVariable) {
          block.variables.order.push(runtimeVariable.reference.refId);
          block.variables.data[runtimeVariable.reference.refId] =
            runtimeVariable;
        }
        const runtimeTrigger = getRuntimeTrigger(token, sectionId);
        if (runtimeTrigger) {
          block.triggers.order.push(runtimeTrigger.reference.refId);
          block.triggers.data[runtimeTrigger.reference.refId] = runtimeTrigger;
        }
        const runtimeCommand = getRuntimeCommand(token, sectionId);
        if (runtimeCommand) {
          block.commands.order.push(runtimeCommand.reference.refId);
          block.commands.data[runtimeCommand.reference.refId] = runtimeCommand;
        }
      }
    });
    blocks[sectionId] = block;
  });

  return blocks;
};
