import { GameProjectData, InstanceData } from "../../../../spark-engine";
import { getData } from "./getData";

export const getChangedInstances = (
  data: InstanceData[],
  project: GameProjectData
): {
  updated: { [refId: string]: InstanceData };
  original: { [refId: string]: InstanceData };
} => {
  const original: { [refId: string]: InstanceData } = {};
  const updated: { [refId: string]: InstanceData } = {};
  data.forEach((d) => {
    const current = getData(d.reference, project);
    if (!current || JSON.stringify(current) !== JSON.stringify(d)) {
      updated[d.reference.refId] = d;
      original[d.reference.refId] = current as InstanceData;
    }
  });
  return { updated, original };
};
