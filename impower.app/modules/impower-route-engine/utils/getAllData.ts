import {
  ConfigData,
  DataLookup,
  GameProjectData,
  InstanceData,
} from "../../../../spark-engine";

const getAllDataInternal = (
  dict: {
    [refId: string]: {
      id: string;
      data: InstanceData;
      level: number;
    };
  },
  level: number,
  project: GameProjectData,
  lookup: DataLookup
): void => {
  switch (lookup.refType) {
    case "Config": {
      if (project?.instances?.configs) {
        Object.keys(project?.instances?.configs.data).forEach((id) => {
          const data: ConfigData = project?.instances?.configs.data[id];
          if (data) {
            dict[id] = { id: data.reference.refId, data, level };
          }
        });
      }
      break;
    }
    default:
      break;
  }
};

export const getAllData = (
  project: GameProjectData,
  lookup: DataLookup
): { [refId: string]: InstanceData } => {
  const dict: {
    [refId: string]: { id: string; data: InstanceData; level: number };
  } = {};
  getAllDataInternal(dict, 0, project, lookup);
  const sortedDictValues = Object.values(dict).sort((a, b) => {
    return a.level > b.level ? 1 : b.level > a.level ? -1 : 0;
  });
  const sortedDict: {
    [refId: string]: InstanceData;
  } = {};
  sortedDictValues.forEach((value) => {
    sortedDict[value.id] = value.data;
  });
  return sortedDict;
};
