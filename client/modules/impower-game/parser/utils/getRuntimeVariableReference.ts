import { FountainVariable } from "../../../impower-script-parser";
import { createVariableReference, VariableReference } from "../../data";

export const getRuntimeVariableReference = (
  variable: FountainVariable
): VariableReference => {
  return createVariableReference({
    parentContainerId: variable?.id?.split(".").slice(0, -1).join(".") || "",
    refId: variable.id || "",
    refTypeId: variable.type === "number" ? "NumberVariable" : "StringVariable",
  });
};
