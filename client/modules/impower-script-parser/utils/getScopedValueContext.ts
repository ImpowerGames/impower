import { SparkSection } from "../types/SparkSection";
import { getScopedContext } from "./getScopedContext";

export const getScopedValueContext = (
  sectionId: string,
  sections: Record<string, SparkSection>
): [Record<string, string>, Record<string, unknown>] => {
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
    { ...sectionIds, ...tagIds, ...assetIds, ...variableIds },
    {
      ...sectionValues,
      ...tagValues,
      ...assetValues,
      ...variableValues,
    },
  ];
};
