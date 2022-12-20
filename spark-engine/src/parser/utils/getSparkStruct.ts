import { SparkStruct, SparkToken } from "../../../../sparkdown";

export const getSparkStruct = (
  token: SparkToken,
  structs: Record<string, SparkStruct>
): SparkStruct | null | undefined => {
  if (!token) {
    return null;
  }
  if (token.ignore) {
    return null;
  }
  if (token.type === "style") {
    return structs?.[token.name || ""];
  }
  if (token.type === "struct_field") {
    return structs?.[token.struct || ""];
  }
  return null;
};
