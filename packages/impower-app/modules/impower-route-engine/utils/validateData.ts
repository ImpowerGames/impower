import { GameProjectData, InstanceData } from "../../../../spark-engine";
import { getUniqueName, isNameable } from "../../impower-core";
import { getAllData } from "./getAllData";
import { getChangedInstances } from "./getChangedInstances";

export const validateData = (
  project: GameProjectData,
  data: InstanceData[]
): {
  updated: { [refId: string]: InstanceData };
  original: { [refId: string]: InstanceData };
} => {
  const firstNewData = data[0];
  const newValidatedDataList: InstanceData[] = [];
  const allSiblings = getAllData(project, firstNewData.reference);
  Object.values(data).forEach((newD) => {
    const validatedD = { ...newD };
    if (isNameable(validatedD)) {
      const otherNames = Object.values(allSiblings)
        .filter(
          (d) =>
            (d as InstanceData)?.reference?.refId !==
            (validatedD as InstanceData)?.reference?.refId
        )
        .map((d) => (isNameable(d) ? d.name : ""));
      validatedD.name = getUniqueName(otherNames, validatedD.name);
    }
    newValidatedDataList.push(validatedD);
    allSiblings[validatedD.reference.refId] = validatedD;
  });
  return getChangedInstances(newValidatedDataList, project);
};
