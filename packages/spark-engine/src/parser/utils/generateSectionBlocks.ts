import { SparkSection } from "../../../../sparkdown";
import { Block } from "../../game";
import { generateCommand } from "./generateCommand";

export const generateSectionBlocks = (
  sections: Record<string, SparkSection>
): Record<string, Block> => {
  const blocks: Record<string, Block> = {};
  if (!sections) {
    return blocks;
  }
  Object.entries(sections).forEach(([sectionId, section]) => {
    const parent = sectionId ? sectionId.split(".").slice(0, -1).join(".") : "";
    const block: Block = {
      indent: section.indent,
      index: section.index,
      from: section.from,
      to: section.to,
      line: section.line,
      name: section.name,
      type: section.type,
      level: section.level,
      triggers: section.triggers || [],
      parent,
      children: section.children || [],
      commands: {},
      variables: section.variables,
    };
    section.tokens?.forEach((token) => {
      const runtimeCommand = generateCommand(token, sectionId);
      if (runtimeCommand) {
        if (!block.commands) {
          block.commands = {};
        }
        block.commands[runtimeCommand.reference.refId] = runtimeCommand;
      }
    });
    blocks[sectionId] = block;
  });

  return blocks;
};
