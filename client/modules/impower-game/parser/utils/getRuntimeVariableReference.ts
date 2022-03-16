import { FountainVariable } from "../../../impower-script-parser";
import { createVariableReference, VariableReference } from "../../data";
import { getScopedItem } from "../../data/utils/getScopedItem";

export const getRuntimeVariableReference = (
  variables: Record<string, FountainVariable>,
  sectionId: string,
  name: string
): VariableReference => {
  const variable = getScopedItem(variables, sectionId, name, "param-");
  return createVariableReference({
    parentContainerId: sectionId || "",
    refId: `${sectionId}.${name}`,
    refTypeId:
      variable?.type === "number" ? "NumberVariable" : "StringVariable",
  });
};
