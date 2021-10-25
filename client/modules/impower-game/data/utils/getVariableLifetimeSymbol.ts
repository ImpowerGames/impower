import { VariableLifetime } from "../enums/variableLifetime";

export const getVariableLifetimeSymbol = (
  operator: VariableLifetime
): string => {
  switch (operator) {
    case VariableLifetime.Temporary:
      return "VAR";
    case VariableLifetime.Constant:
      return "CONST";
    case VariableLifetime.Parameter:
      return "PARAM";
    case VariableLifetime.ReferenceParameter:
      return "REF PARAM";
    default:
      return "";
  }
};
