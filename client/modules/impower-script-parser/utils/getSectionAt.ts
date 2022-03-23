import { FountainParseResult } from "..";
import { FountainSection } from "../types/FountainSection";

export const getSectionAt = (
  pos: number,
  result: FountainParseResult
): [string, FountainSection] => {
  const sectionEntries = Object.entries(result?.sections || {});
  for (let i = sectionEntries.length - 1; i >= 0; i -= 1) {
    const [id, section] = sectionEntries[i];
    if (pos >= section.to) {
      return [id, section];
    }
  }
  return [undefined, undefined];
};
