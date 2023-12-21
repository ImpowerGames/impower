import type { SparkSection } from "../../../../sparkdown/src/types/SparkSection";
import type { Block } from "../../game";
import { generateCommand } from "./generateCommand";

export const combineBlockMap = (
  file: string,
  sections: Record<string, SparkSection> | undefined,
  result: Record<string, Block> = {}
) => {
  if (!sections) {
    return result;
  }
  Object.entries(sections).forEach(([sectionId, s]) => {
    const block: Block = result[sectionId] ?? {
      source: {
        file,
        line: s.line,
        from: s.from,
        to: s.to,
      },
      name: s.name,
      level: s.level,
      parent: s.parent,
      children: s.children || [],
      commands: {},
    };
    s.tokens?.forEach((token) => {
      const runtimeCommand = generateCommand(token, file, sectionId);
      if (runtimeCommand) {
        if (!block.commands) {
          block.commands = {};
        }
        block.commands[runtimeCommand.reference.id] = runtimeCommand;
      }
    });
    result[sectionId] = block;
  });

  return result;
};
