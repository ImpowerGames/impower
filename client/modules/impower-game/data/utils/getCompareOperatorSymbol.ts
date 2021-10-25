import { CompareOperator } from "../enums/compareOperator";

export const getCompareOperatorSymbol = (operator: CompareOperator): string => {
  switch (operator) {
    case CompareOperator.Equals:
      return "==";
    case CompareOperator.NotEquals:
      return "!=";
    case CompareOperator.LessThan:
      return "<";
    case CompareOperator.GreaterThan:
      return ">";
    case CompareOperator.LessThanOrEquals:
      return "<=";
    case CompareOperator.GreaterThanOrEquals:
      return ">=";
    default:
      return "";
  }
};
