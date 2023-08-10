import type { SparkSection } from "../../../../sparkdown/src";
import type { Block } from "../../game";
import { generateCommand } from "./generateCommand";

export const generateSectionBlocks = (
  file: string,
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
      source: {
        file,
        line: section.line,
        from: section.from,
        to: section.to,
      },
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
      const runtimeCommand = generateCommand(token, file, sectionId);
      if (runtimeCommand) {
        if (!block.commands) {
          block.commands = {};
        }
        block.commands[runtimeCommand.reference.id] = runtimeCommand;
      }
    });
    blocks[sectionId] = block;
  });

  return blocks;
};
