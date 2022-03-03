import { VariableData } from "../../project/classes/instances/items/variable/variableData";

export const getVariableValue = <T>(
  variables: { [refId: string]: VariableData },
  variableName: string,
  blockId?: string
): T | undefined => {
  const data =
    variables[`${blockId || ""}.${variableName}`] ||
    variables[`.${variableName}`];
  if (data) {
    return data.value as T;
  }
  return undefined;
};
