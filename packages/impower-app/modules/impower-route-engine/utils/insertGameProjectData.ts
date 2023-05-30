import {
    ConfigData,
    GameProjectData,
    InstanceData,
} from "../../../../spark-engine";
import { groupBy } from "../../impower-core";

export const insertGameProjectData = (
  project: GameProjectData,
  newData: InstanceData[],
  validateData: (
    project: GameProjectData,
    newData: InstanceData[]
  ) => {
    updated: { [refId: string]: InstanceData };
    original: { [refId: string]: InstanceData };
  }
): {
  newProject: GameProjectData;
  updated: { [refId: string]: InstanceData };
  original: { [refId: string]: InstanceData };
} => {
  let newProject: GameProjectData = { ...project };
  let allOriginal: { [refId: string]: InstanceData } = {};
  let allUpdated: { [refId: string]: InstanceData } = {};

  const groupedData = groupBy(newData, (d: InstanceData) => {
    return `${d.reference.parentContainerId}${d.reference.refType}`;
  });

  Object.values(groupedData).forEach((newDataList) => {
    const firstNewData = newDataList[0];
    const { refType } = firstNewData.reference;

    const { updated, original } = validateData(newProject, newDataList);
    allUpdated = { ...allUpdated, ...updated };
    allOriginal = { ...allOriginal, ...original };

    switch (refType) {
      case "Config": {
        const updatedData: { [refId: string]: ConfigData } = {};
        Object.entries(updated).forEach(([key, value]) => {
          updatedData[key] = value as ConfigData;
        });
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            configs: {
              ...newProject?.instances?.configs,
              data: {
                ...newProject?.instances?.configs.data,
                ...updatedData,
              },
            },
          },
        };
        break;
      }
      default:
        break;
    }
  });

  return { newProject, updated: allUpdated, original: allOriginal };
};
