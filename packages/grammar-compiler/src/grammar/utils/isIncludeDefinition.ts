import { IncludeDefinition } from "../types/GrammarDefinition";

export const isIncludeDefinition = (obj: unknown): obj is IncludeDefinition => {
  const item = obj as IncludeDefinition;
  return Boolean(item.include);
};
