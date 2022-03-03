import { FountainVariable } from "../../../impower-script-parser";
import { createVariableReference, VariableReference } from "../../data";
import { getFountainVariable } from "./getFountainVariable";

export const getRuntimeVariableReference = (
  name: string,
  sectionId: string,
  variables: Record<string, FountainVariable>
): VariableReference => {
  const variable = getFountainVariable(name, sectionId, variables);
  return createVariableReference({
    parentContainerId: sectionId || "",
    refId: `${sectionId}.${name}`,
    refTypeId:
      variable?.type === "number" ? "NumberVariable" : "StringVariable",
  });
};
