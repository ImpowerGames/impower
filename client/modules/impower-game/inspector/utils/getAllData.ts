import { orderBy } from "../../../impower-core";
import {
  ConfigData,
  DataLookup,
  GameProjectData,
  InstanceData,
  Permission,
} from "../../data";

const getAllDataInternal = (
  dict: {
    [refId: string]: {
      id: string;
      data: InstanceData;
      level: number;
    };
  },
  level: number,
  permission: Permission,
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
    case "Block": {
      if (project?.instances?.blocks) {
        if (!lookup.parentContainerId || permission === Permission.Runtime) {
          Object.keys(project?.instances?.blocks?.data || {}).forEach((id) => {
            const data = project?.instances?.blocks.data[id];
            if (data) {
              dict[id] = { id: data.reference.refId, data, level };
            }
          });
        } else {
          const data =
            project?.instances?.blocks.data[lookup.parentContainerId];
          if (!data) {
            throw new Error(
              `${lookup.parentContainerType} with id '${lookup.parentContainerId}' does not exist in project`
            );
          }
          data.children?.forEach((id) => {
            const childData = project?.instances?.blocks.data[id];
            if (childData) {
              dict[id] = {
                id: childData.reference.refId,
                data: childData,
                level,
              };
            }
          });
        }
      }
      break;
    }
    case "Command": {
      if (project?.instances?.blocks) {
        if (!lookup.parentContainerId || permission === Permission.Runtime) {
          const blocks = Object.values(project?.instances?.blocks?.data || {});
          blocks.forEach((block) =>
            block.commands.order.forEach((id) => {
              const data = block.commands.data[id];
              dict[id] = { id: data.reference.refId, data, level };
            })
          );
        } else {
          const block =
            project?.instances?.blocks.data[lookup.parentContainerId];
          if (!block) {
            throw new Error(
              `${lookup.parentContainerType} with id '${lookup.parentContainerId}' does not exist in project`
            );
          }
          block.commands.order.forEach((id) => {
            const data = block.commands.data[id];
            if (data) {
              dict[id] = { id: data.reference.refId, data, level };
            }
          });
        }
      }
      break;
    }
    default:
      break;
  }
};

export const getAllData = (
  permission: Permission,
  project: GameProjectData,
  lookup: DataLookup
): { [refId: string]: InstanceData } => {
  const dict: {
    [refId: string]: { id: string; data: InstanceData; level: number };
  } = {};
  getAllDataInternal(dict, 0, permission, project, lookup);
  const sortedDictValues = orderBy(
    Object.values(dict),
    (value: { id: string; data: InstanceData; level: number }) => value.level
  );
  const sortedDict: {
    [refId: string]: InstanceData;
  } = {};
  sortedDictValues.forEach((value) => {
    sortedDict[value.id] = value.data;
  });
  return sortedDict;
};
