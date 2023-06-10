import { IncludeItem } from "../grammar/types/definition";

export const isIncludeItem = (obj: unknown): obj is IncludeItem => {
  const item = obj as IncludeItem;
  return Boolean(item.include);
};
