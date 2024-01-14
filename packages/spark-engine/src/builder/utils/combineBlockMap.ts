import type { SparkSection } from "../../../../sparkdown/src/types/SparkSection";
import type { BlockData } from "../../game";
import { generateCommand } from "./generateCommand";

export const combineBlockMap = (
  file: string,
  sections: Record<string, SparkSection> | undefined,
  result: Record<string, BlockData> = {}
) => {
  if (!sections) {
    return result;
  }
  Object.entries(sections).forEach(([sectionId, s]) => {
    const block: BlockData = result[sectionId] ?? {
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
      commands: [],
      path: s.path,
    };
    s.tokens?.forEach((token) => {
      block.commands ??= [];
      const commandIndex = block.commands.length;
      const runtimeCommand = generateCommand(
        token,
        file,
        sectionId,
        commandIndex
      );
      if (runtimeCommand) {
        block.commands.push(runtimeCommand);
      }
    });
    result[sectionId] = block;
  });

  return result;
};
