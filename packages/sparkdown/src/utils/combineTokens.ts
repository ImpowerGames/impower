import { SparkProgram } from "../types/SparkProgram";
import { SparkToken } from "../types/SparkToken";

const combineTokens = (programs: SparkProgram[]): SparkToken[] => {
  const sectionTokens: Record<string, SparkToken[]> = {};
  programs.forEach((program) => {
    Object.entries(program.sections).forEach(([k, v]) => {
      sectionTokens[k] ??= [];
      sectionTokens[k]!.push(...v.tokens);
    });
  });

  const combined: SparkToken[] = [];
  Object.values(sectionTokens).forEach((tokens) => {
    combined.push(...tokens);
  });
  return combined;
};

export default combineTokens;
