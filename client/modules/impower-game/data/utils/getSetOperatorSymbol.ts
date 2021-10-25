import { SetOperator } from "../enums/setOperator";

export const getSetOperatorSymbol = (operator: SetOperator): string => {
  switch (operator) {
    case SetOperator.Assign:
      return "=";
    case SetOperator.Negate:
      return "=!";
    case SetOperator.Add:
      return "+=";
    case SetOperator.Subtract:
      return "-=";
    case SetOperator.Multiply:
      return "*=";
    case SetOperator.Divide:
      return "/=";
    default:
      return "";
  }
};
