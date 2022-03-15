import { VariableData } from "../../project/classes/instances/items/variable/variableData";
import { getAncestorIds } from "./getAncestorIds";

export const getVariableValue = <T>(
  variables: { [refId: string]: VariableData },
  name: string,
  blockId?: string
): T | undefined => {
  const ids = getAncestorIds(blockId);
  const foundSectionId =
    ids.find((x) => Boolean(variables?.[`${x}.${name}`])) || "";
  const found =
    variables?.[`${blockId}.param-${name}`] ||
    variables?.[`${foundSectionId}.${name}`];
  if (found) {
    return found.value as T;
  }
  return undefined;
};
