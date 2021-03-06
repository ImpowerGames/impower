import { Reference } from "../interfaces/reference";
import { VariableData } from "../../project/classes/instances/items/variable/variableData";
import { ItemType } from "../enums/data";
import { getVariableValue } from "./getVariableValue";

export const getReferenceValue = <T>(
  reference: Reference,
  variables?: { [refId: string]: VariableData }
): T | undefined => {
  if (reference !== null) {
    const { refId } = reference;
    if (reference.refType === ItemType.Variable && variables) {
      return getVariableValue<T>(refId, variables);
    }
  }
  return undefined;
};
