import { SparkEntity, SparkToken } from "../../../../sparkdown";

export const getSparkEntity = (
  token: SparkToken,
  entities: Record<string, SparkEntity>
): SparkEntity | null => {
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
