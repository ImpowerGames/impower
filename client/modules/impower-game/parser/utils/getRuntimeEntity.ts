import { SparkToken } from "../../../impower-script-parser";
import { SparkEntity } from "../../../impower-script-parser/types/SparkEntity";

export const getRuntimeEntity = (
  token: SparkToken,
  entities: Record<string, SparkEntity>
): SparkEntity => {
  if (!token) {
    return null;
  }
  if (token.ignore) {
    return null;
  }
  if (token.type === "style") {
    return entities?.[token.name];
  }
  if (token.type === "entity_value_field") {
    return entities?.[token.entity];
  }
  if (token.type === "entity_object_field") {
    return entities?.[token.entity];
  }

  return null;
};
