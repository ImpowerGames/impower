import { VariableData } from "../../project/classes/instances/items/variable/variableData";
import { Reference } from "../interfaces/reference";

export const getReferenceValue = <T>(
  reference: Reference,
  variables?: { [refId: string]: VariableData }
): T | undefined => {
  if (reference !== null) {
    const { refId } = reference;
    if (reference.refType === "Variable" && variables) {
      return variables?.[refId]?.value as T;
    }
  }
  return undefined;
};
