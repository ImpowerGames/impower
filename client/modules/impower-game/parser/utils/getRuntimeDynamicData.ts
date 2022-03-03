import { FountainVariable } from "../../../impower-script-parser";
import { DynamicData } from "../../data";
import { getRuntimeVariableReference } from "./getRuntimeVariableReference";

export const getRuntimeDynamicData = <T extends string | number>(
  value: T | { name: string },
  sectionId: string,
  variables: Record<string, FountainVariable>
): DynamicData<T> => {
  const variableReference =
    typeof value === "string" || typeof value === "number"
      ? undefined
      : getRuntimeVariableReference(value?.name, sectionId, variables);
  const constant =
    typeof value === "number" ||
    variableReference?.refTypeId === "NumberVariable"
      ? 0
      : "";
  const dynamic =
    typeof value === "string" || typeof value === "number"
      ? null
      : variableReference;
  return {
    constant: constant as T,
    dynamic,
  };
};
