import { SparkEntity } from "../types/SparkEntity";
import { SparkSection } from "../types/SparkSection";
import { getEntityContext } from "./getEntityContext";
import { getScopedContext } from "./getScopedContext";

export const getScopedEvaluationContext = (
  sectionId: string,
  sections: Record<string, SparkSection>,
  entities: Record<string, SparkEntity>
): [Record<string, string>, Record<string, unknown>] => {
  const [entityNames, entityValues] = getEntityContext(entities);
  const [sectionIds, sectionValues] = getScopedContext(
    sectionId,
    sections,
    "sections"
  );
  const [tagIds, tagValues] = getScopedContext(sectionId, sections, "tags");
  const [assetIds, assetValues] = getScopedContext(
    sectionId,
    sections,
    "assets"
  );
  const [variableIds, variableValues] = getScopedContext(
    sectionId,
    sections,
    "variables"
  );
  return [
    { ...entityNames, ...sectionIds, ...tagIds, ...assetIds, ...variableIds },
    {
      ...entityValues,
      ...sectionValues,
      ...tagValues,
      ...assetValues,
      ...variableValues,
    },
  ];
};
