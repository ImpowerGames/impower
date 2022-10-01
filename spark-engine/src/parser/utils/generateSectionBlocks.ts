import { Block } from "../../..";
import { SparkSection } from "../../../../sparkdown";
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
      ids: {},
      indent: section.indent,
      index: section.index,
      from: section.from,
      to: section.to,
      line: section.line,
      name: section.name,
      type: section.type,
      level: section.level,
      parameters:
        Object.values(section.variables || {})
          .filter((v) => v.parameter)
          .map((p) => p.name) || [],
      triggers: section.triggers || [],
      parent,
      children: section.children || [],
      commands: {},
      variables: section.variables,
      tags: section.tags,
      assets: section.assets,
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
