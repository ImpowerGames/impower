import { FountainVariable } from "../../../impower-script-parser";
import { createVariableReference, VariableReference } from "../../data";
import { getScopedItem } from "./getScopedItem";

export const getRuntimeVariableReference = (
  name: string,
  sectionId: string,
  variables: Record<string, FountainVariable>
): VariableReference => {
  const variable = getScopedItem(name, sectionId, variables);
  return createVariableReference({
    parentContainerId: sectionId || "",
    refId: `${sectionId}.${name}`,
    refTypeId:
      variable?.type === "number" ? "NumberVariable" : "StringVariable",
  });
};
