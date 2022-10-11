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
  const [variableIds, variableValues] = getScopedContext(
    sectionId,
    sections,
    "variables"
  );
  return [
    { ...sectionIds, ...variableIds },
    {
      ...sectionValues,
      ...variableValues,
    },
  ];
};
