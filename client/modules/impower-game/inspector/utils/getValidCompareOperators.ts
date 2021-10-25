import { CompareOperator } from "../../data";

export const getValidCompareOperators = <T>(lhs: T): CompareOperator[] => {
  if (typeof lhs === "number") {
    return [
      CompareOperator.Equals,
      CompareOperator.NotEquals,
      CompareOperator.LessThan,
      CompareOperator.GreaterThan,
      CompareOperator.LessThanOrEquals,
      CompareOperator.GreaterThanOrEquals,
    ];
  }
  return [CompareOperator.Equals, CompareOperator.NotEquals];
};
