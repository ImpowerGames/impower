import { FountainVariable } from "../../../impower-script-parser";
import { DynamicData } from "../../data";
import { getRuntimeVariableReference } from "./getRuntimeVariableReference";

export const getRuntimeDynamicData = <T extends string | number>(
  value: T | FountainVariable
): DynamicData<T> => {
  const constant =
    typeof value === "string" || typeof value === "number"
      ? value
      : value?.type === "number"
      ? 0
      : "";
  const dynamic =
    typeof value === "string" || typeof value === "number"
      ? null
      : getRuntimeVariableReference(value);
  return {
    constant: constant as T,
    dynamic,
  };
};
