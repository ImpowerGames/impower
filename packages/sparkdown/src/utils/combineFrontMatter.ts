import { SparkProgram } from "../types/SparkProgram";

const combineFrontMatter = (
  programs: SparkProgram[]
): Record<string, string[]> => {
  const combined: Record<string, string[]> = {};
  programs.forEach((program) => {
    if (program.frontMatter) {
      Object.entries(program.frontMatter).forEach(([k, v]) => {
        combined[k] ??= [];
        v.forEach((s) => {
          combined[k]!.push(s);
        });
      });
    }
  });
  return combined;
};

export default combineFrontMatter;
