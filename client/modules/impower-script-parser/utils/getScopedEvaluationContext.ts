import { SparkSection } from "../types/SparkSection";
import { getScopedContext } from "./getScopedContext";

export const getScopedEvaluationContext = (
  sectionId: string,
  sections: Record<string, SparkSection>
): [Record<string, string>, Record<string, string | number | boolean>] => {
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
  const [entityIds, entityValues] = getScopedContext(
    sectionId,
    sections,
    "entities"
  );
  const [variableIds, variableValues] = getScopedContext(
    sectionId,
    sections,
    "variables"
  );
  return [
    { ...sectionIds, ...tagIds, ...assetIds, ...entityIds, ...variableIds },
    {
      ...sectionValues,
      ...tagValues,
      ...assetValues,
      ...entityValues,
      ...variableValues,
    },
  ];
};
