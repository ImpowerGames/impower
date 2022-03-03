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
  if (token.type === "declare") {
    return createVariableData({
      reference: getRuntimeVariableReference(
        token.variable,
        sectionId,
        variables
      ),
      pos: token.start,
      line: token.line,
      name: token.variable,
      value: token?.value,
    });
  }

  return null;
};
