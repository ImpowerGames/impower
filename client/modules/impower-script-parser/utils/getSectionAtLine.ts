import { SparkParseResult } from "..";
import { SparkSection } from "../types/SparkSection";

export const getSectionAtLine = (
  line: number,
  result: SparkParseResult
): [string, SparkSection] => {
  const sectionEntries = Object.entries(result?.sections || {});
  for (let i = sectionEntries.length - 1; i >= 0; i -= 1) {
    const [id, section] = sectionEntries[i];
    if (line >= section.line) {
      return [id, section];
    }
  }
  return ["", result?.sections[""]];
};
