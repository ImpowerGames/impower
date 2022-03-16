import {
  FountainToken,
  FountainVariable,
} from "../../../impower-script-parser";
import { createVariableData, VariableData } from "../../data";
import { getRuntimeVariableReference } from "./getRuntimeVariableReference";

export const getRuntimeVariable = (
  token: FountainToken,
  sectionId = "",
  variables: Record<string, FountainVariable>
): VariableData => {
  if (token.type === "variable") {
    return createVariableData({
      reference: getRuntimeVariableReference(variables, sectionId, token.name),
      pos: token.start,
      line: token.line,
      name: token.name,
      value: token?.value,
    });
  }

  return null;
};
