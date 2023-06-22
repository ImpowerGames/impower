import { SparkProgram } from "../types/SparkProgram";
import { SparkSection } from "../types/SparkSection";

export const getSectionAt = (
  pos: number,
  program: SparkProgram
): [string, SparkSection | undefined] => {
  const sectionEntries = Object.entries(program?.sections || {});
  for (let i = sectionEntries.length - 1; i >= 0; i -= 1) {
    const [id, section] = sectionEntries[i] || [];
    if (id !== undefined && section !== undefined) {
      const from = section.from || 0;
      if (pos >= from) {
        return [id, section];
      }
    }
  }
  return ["", program?.sections?.[""]];
};
