import { CompareOperator, Condition, VariableData } from "../../data";
import { ImpowerGame } from "../../game";
import { getRuntimeValue } from "./getRuntimeValue";

export const isConditionSatisfied = (
  condition: Condition,
  variables: { [refId: string]: VariableData },
  game: ImpowerGame
): boolean => {
  const lhs = getRuntimeValue(condition.variable, variables, game);
  if (lhs === undefined) {
    return false;
  }
  const rhs = getRuntimeValue(condition.value, variables, game);
  const { operator } = condition;
  switch (operator) {
    case CompareOperator.Equals:
      return JSON.stringify(lhs) === JSON.stringify(rhs);
    case CompareOperator.NotEquals:
      return JSON.stringify(lhs) !== JSON.stringify(rhs);
    case CompareOperator.GreaterThan:
      return typeof lhs === "number" && typeof rhs === "number" && lhs > rhs;
    case CompareOperator.LessThan:
      return typeof lhs === "number" && typeof rhs === "number" && lhs < rhs;
    case CompareOperator.GreaterThanOrEquals:
      return typeof lhs === "number" && typeof rhs === "number" && lhs >= rhs;
    case CompareOperator.LessThanOrEquals:
      return typeof lhs === "number" && typeof rhs === "number" && lhs <= rhs;
    default:
      return false;
  }
};
