import { FountainParseResult } from "../../../impower-script-parser";
import { BlockData, createBlockData, createBlockReference } from "../../data";
import { getRuntimeCommand } from "./getRuntimeCommand";

export const getRuntimeBlocks = (
  result: FountainParseResult
): Record<string, BlockData> => {
  const blocks: { [refId: string]: BlockData } = {};
  if (!result) {
    return blocks;
  }
  const sections = result?.sections;
  if (!sections) {
    return blocks;
  }
  Object.entries(sections).forEach(([sectionId, section]) => {
    const block = createBlockData({
      reference: createBlockReference({
        parentContainerId: sectionId
          ? sectionId.split(".").slice(0, -1).join(".")
          : null,
        refId: sectionId,
      }),
      pos: section.from,
      line: section.line,
      name: section.name,
      type: section.type,
      parameters:
        Object.values(section.variables || {})
          .filter((v) => v.parameter)
          .map((p) => p.name) || [],
      triggers: section.triggers || [],
      children: section.children || [],
    });
    section.tokens.forEach((token) => {
      const runtimeCommand = getRuntimeCommand(token, sectionId);
      if (runtimeCommand) {
        block.commands.order.push(runtimeCommand.reference.refId);
        block.commands.data[runtimeCommand.reference.refId] = runtimeCommand;
      }
    });
    blocks[sectionId] = block;
  });

  return blocks;
};
