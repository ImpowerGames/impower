import { getVarName } from "../../../spark-engine/src/game/modules/ui/utils/getVarName";

export const getCssTokenValue = (value: unknown): unknown => {
  if (
    typeof value === "object" &&
    value &&
    "$name" in value &&
    typeof value.$name === "string" &&
    value.$name
  ) {
    if ("$type" in value && typeof value.$type === "string" && value.$type) {
      return `var(${getVarName(value.$type, value.$name)})`;
    }
    return value.$name;
  }
  return value;
};
