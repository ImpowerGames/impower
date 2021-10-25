import { DynamicData } from "../interfaces/generics/dynamicData";
import { VariableData } from "../../project/classes/instances/items/variable/variableData";
import { getReferenceValue } from "./getReferenceValue";

export const getDynamicValue = <T>(
  dynamicData: DynamicData<T>,
  variables?: { [refId: string]: VariableData }
): T | undefined => {
  if (dynamicData.dynamic) {
    const reference = dynamicData.dynamic;
    return getReferenceValue(reference, variables);
  }
  return dynamicData.constant;
};
