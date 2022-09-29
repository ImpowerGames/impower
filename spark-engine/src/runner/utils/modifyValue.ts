import { SetOperator } from "../../data";

export const modifyValue = <T>(
  lhs: T,
  operator: SetOperator,
  rhs: T
): T | undefined => {
  switch (operator) {
    case "=":
      return rhs;
    case "!=":
      if (typeof rhs === "boolean") {
        return !rhs as unknown as T;
      }
      break;
    case "+=":
      if (typeof lhs === "number" && typeof rhs === "number") {
        return (lhs + rhs) as unknown as T;
      }
      if (typeof lhs === "string" && typeof rhs === "string") {
        return (lhs + rhs) as unknown as T;
      }
      break;
    case "-=":
      if (typeof lhs === "number" && typeof rhs === "number") {
        return (lhs - rhs) as unknown as T;
      }
      break;
    case "*=":
      if (typeof lhs === "number" && typeof rhs === "number") {
        return (lhs * rhs) as unknown as T;
      }
      break;
    case "/=":
      if (typeof lhs === "number" && typeof rhs === "number") {
        return (lhs / rhs) as unknown as T;
      }
      break;
    default:
      return undefined;
  }
  return undefined;
};
