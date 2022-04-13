import { SparkEntity } from "../types/SparkEntity";
import { SparkSection } from "../types/SparkSection";
import { getScopedContext } from "./getScopedContext";

export const getScopedEvaluationContext = (
  sectionId: string,
  sections: Record<string, SparkSection>,
  entities: Record<string, SparkEntity>
): [Record<string, string>, Record<string, unknown>] => {
  const entityNames: Record<string, string> = Object.keys(
    entities || {}
  ).reduce((p, c) => {
    p[c] = c;
    return p;
  }, {});
  const entityValues: Record<string, unknown> = {};
  Object.values(entities || {}).forEach((e) => {
    let curr = e;
    while (curr) {
      const name = curr?.name;
      Object.entries(curr.fields || {}).forEach(([k, v]) => {
        const id = name + k;
        if (entityValues[id] === undefined) {
          entityValues[id] = v.value;
        }
      });
      curr = entities[curr.base];
    }
  });
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
