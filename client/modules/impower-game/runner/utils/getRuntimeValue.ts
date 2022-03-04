import {
  DynamicData,
  isDynamicData,
  Reference,
  VariableValue,
} from "../../data";
import { ImpowerGame } from "../../game";

export const getRuntimeValue = <T>(
  data: DynamicData<T> | Reference,
  variables?: { [id: string]: VariableValue },
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
      return variables?.[refId]?.value as T;
    }
  }
  if (isDynamicData(data)) {
    return data.constant;
  }
  return undefined;
};
