import { SetOperator } from "../../data";

export const getValidSetOperators = <T>(lhs: T): SetOperator[] => {
  if (typeof lhs === "number") {
    return [
      SetOperator.Assign,
      SetOperator.Add,
      SetOperator.Subtract,
      SetOperator.Multiply,
      SetOperator.Divide,
    ];
  }
  if (typeof lhs === "string") {
    return [SetOperator.Assign, SetOperator.Add];
  }
  if (typeof lhs === "boolean") {
    return [SetOperator.Assign, SetOperator.Negate];
  }
  return [SetOperator.Assign];
};
