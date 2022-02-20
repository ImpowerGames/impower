import {
  DynamicData,
  getVariableValue,
  isDynamicData,
  Reference,
  VariableData,
} from "../../data";
import { ImpowerGame } from "../../game";

export const getRuntimeValue = <T>(
  data: DynamicData<T> | Reference,
  variables?: { [refId: string]: VariableData },
  game?: ImpowerGame
): T | undefined => {
  const reference = isDynamicData(data) ? data.dynamic : data;
  if (reference) {
    const { refId } = reference;
    if (reference.refType === "Variable" && variables) {
      const variableState = game?.logic.state.variableStates[refId];
      if (variableState) {
        return variableState.value as T;
      }
      return getVariableValue<T>(refId, variables);
    }
  }
  if (isDynamicData(data)) {
    return data.constant;
  }
  return undefined;
};
