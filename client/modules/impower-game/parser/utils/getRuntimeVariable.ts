import { FountainToken } from "../../../impower-script-parser";
import { createVariableData, VariableData } from "../../data";
import { getRuntimeVariableReference } from "./getRuntimeVariableReference";

export const getRuntimeVariable = (token: FountainToken): VariableData => {
  if (token.type === "declare") {
    const refId = token?.variable?.id;
    const name = refId.split(".").slice(-1).join(".");
    const value = token?.value;
    return createVariableData({
      reference: getRuntimeVariableReference(token.variable),
      line: token.line,
      name,
      value,
    });
  }

  return null;
};
