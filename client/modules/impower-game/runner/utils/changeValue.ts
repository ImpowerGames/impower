import { SetOperator } from "../../data";

export const changeValue = <T>(
  lhs: T,
  operator: SetOperator,
  rhs: T
): T | undefined => {
  switch (operator) {
    case SetOperator.Assign:
      return rhs;
    case SetOperator.Negate:
      if (typeof rhs === "boolean") {
        return !rhs as unknown as T;
      }
      break;
    case SetOperator.Add:
      if (typeof lhs === "number" && typeof rhs === "number") {
        return (lhs + rhs) as unknown as T;
      }
      if (typeof lhs === "string" && typeof rhs === "string") {
        return (lhs + rhs) as unknown as T;
      }
      break;
    case SetOperator.Subtract:
      if (typeof lhs === "number" && typeof rhs === "number") {
        return (lhs - rhs) as unknown as T;
      }
      break;
    case SetOperator.Multiply:
      if (typeof lhs === "number" && typeof rhs === "number") {
        return (lhs * rhs) as unknown as T;
      }
      break;
    case SetOperator.Divide:
      if (typeof lhs === "number" && typeof rhs === "number") {
        return (lhs / rhs) as unknown as T;
      }
      break;
    default:
      return undefined;
  }
  return undefined;
};
