import { RecursiveValidation } from "../types/RecursiveValidation";
import { traverse } from "./traverse";

export const getAllPropertyRequirements = <T extends RecursiveValidation>(
  validation: T
): Record<string, [unknown, unknown[], unknown | boolean[]]> => {
  const props: Record<string, [unknown, unknown[], unknown | boolean[]]> = {};
  traverse(validation, (path, v: any) => {
    props[path] = v;
  });
  return props;
};
