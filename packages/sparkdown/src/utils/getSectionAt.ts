import { SparkParseResult } from "../types/SparkParseResult";
import { SparkSection } from "../types/SparkSection";

export const getSectionAt = (
  pos: number,
  result: SparkParseResult
): [string, SparkSection | undefined] => {
  const sectionEntries = Object.entries(result?.sections || {});
  for (let i = sectionEntries.length - 1; i >= 0; i -= 1) {
    const [id, section] = sectionEntries[i] || [];
    if (id !== undefined && section !== undefined) {
      const from = section.from || 0;
      if (pos >= from) {
        return [id, section];
      }
    }
  }
  return ["", result?.sections?.[""]];
};
