import { orderBy } from "../../../impower-core";
import {
  ConfigData,
  ConfigType,
  ContainerType,
  DataLookup,
  FileData,
  FolderData,
  GameProjectData,
  InstanceData,
  isContainerReference,
  ItemType,
  Permission,
  Scope,
  StorageType,
  VariableContainerData,
  VariableData,
  VariableLifetime,
} from "../../data";
import { getData } from "./getData";
import { getVariableContainer } from "./getVariableContainer";

const getAllDataInternal = (
  dict: {
    [refId: string]: {
      id: string;
      data: InstanceData | FileData | FolderData;
      level: number;
    };
  },
  level: number,
  permission: Permission,
  project: GameProjectData,
  lookup: DataLookup
): void => {
  switch (lookup.refType) {
    case ConfigType.Config: {
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
    case ContainerType.Construct: {
      if (project?.instances?.constructs) {
        if (
          !lookup.parentContainerId ||
          permission === Permission.Runtime ||
          permission === Permission.Access ||
          permission === Permission.Set
        ) {
          Object.keys(project?.instances?.constructs.data).forEach((id) => {
            const data = project?.instances?.constructs.data[id];
            if (data) {
              dict[id] = { id: data.reference.refId, data, level };
            }
          });
        } else {
          const data =
            project?.instances?.constructs.data[lookup.parentContainerId];
          if (!data) {
            throw new Error(
              `${lookup.parentContainerType} with id '${lookup.parentContainerId}' does not exist in project`
            );
          }
          data.childContainerIds?.forEach((id) => {
            const childData = project?.instances?.constructs.data[id];
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
    case ContainerType.Block: {
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
          data.childContainerIds?.forEach((id) => {
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
    case ItemType.Element: {
      if (project?.instances?.constructs) {
        if (
          !lookup.parentContainerId ||
          permission === Permission.Runtime ||
          permission === Permission.Access ||
          permission === Permission.Set
        ) {
          const constructs = Object.values(project?.instances?.constructs.data);
          constructs.forEach((construct) =>
            construct.elements.order.forEach((id) => {
              const data = construct.elements.data[id];
              dict[id] = { id: data.reference.refId, data, level };
            })
          );
        } else {
          const construct =
            project?.instances?.constructs.data[lookup.parentContainerId];
          if (!construct) {
            throw new Error(
              `${lookup.parentContainerType} with id '${lookup.parentContainerId}' does not exist in project`
            );
          }
          construct.elements.order.forEach((id) => {
            const data = construct.elements.data[id];
            if (data) {
              dict[id] = { id: data.reference.refId, data, level };
            }
          });
        }
      }
      break;
    }
    case ItemType.Trigger: {
      if (project?.instances?.blocks) {
        if (!lookup.parentContainerId || permission === Permission.Runtime) {
          const blocks = Object.values(project?.instances?.blocks?.data || {});
          blocks.forEach((block) =>
            block.triggers.order.forEach((id) => {
              const data = block.triggers.data[id];
              dict[id] = { id: data.reference.refId, data, level };
            })
          );
        } else {
          const block =
            project?.instances?.blocks?.data?.[lookup.parentContainerId];
          if (!block) {
            throw new Error(
              `${lookup.parentContainerType} with id '${lookup.parentContainerId}' does not exist in project`
            );
          }
          block.triggers.order.forEach((id) => {
            const data = block.triggers.data[id];
            if (data) {
              dict[id] = { id: data.reference.refId, data, level };
            }
          });
        }
      }
      break;
    }
    case ItemType.Command: {
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
    case ItemType.Variable: {
      if (project?.instances?.blocks || project?.instances?.constructs) {
        if (
          !lookup.parentContainerType ||
          !lookup.parentContainerId ||
          permission === Permission.Runtime
        ) {
          const constructs = Object.values(project?.instances?.constructs.data);
          constructs.forEach((construct) =>
            construct.variables.order.forEach((id) => {
              const data = construct.variables.data[id];
              dict[id] = { id: data.reference.refId, data, level };
            })
          );
          const blocks = Object.values(project?.instances?.blocks?.data || {});
          blocks.forEach((block) =>
            block.variables.order.forEach((id) => {
              const data = block.variables.data[id];
              dict[id] = { id: data.reference.refId, data, level };
            })
          );
        } else if (lookup.parentContainerId) {
          const container: VariableContainerData = getVariableContainer(
            project,
            lookup.parentContainerType,
            lookup.parentContainerId
          );
          if (!container) {
            throw new Error(
              `${lookup.parentContainerType} with id '${lookup.parentContainerId}' does not exist in project`
            );
          }
          container.variables.order.forEach((id) => {
            const data = container.variables.data[id];
            const rootData = getData(
              {
                ...data.reference,
                parentContainerId: data.overrideParentContainerId,
              },
              project
            ) as VariableData;
            if (
              level === 0 ||
              (rootData &&
                (permission === Permission.Access ||
                  rootData.permission === permission) &&
                (rootData.scope === Scope.Descendents ||
                  (rootData.scope === Scope.Children && level <= 1) ||
                  (rootData.scope === Scope.Self &&
                    level <= 0 &&
                    data.overrideParentContainerId ===
                      lookup.parentContainerId)))
            ) {
              if (
                permission !== Permission.Set ||
                rootData.lifetime === VariableLifetime.Temporary
              ) {
                if (id in dict) {
                  dict[id].level = level;
                } else {
                  dict[id] = { id: data.reference.refId, data, level };
                }
              }
            }
          });
          if (
            isContainerReference(container.reference) &&
            container.reference.parentContainerId
          ) {
            getAllDataInternal(dict, level + 1, permission, project, {
              ...lookup,
              parentContainerId: container.reference.parentContainerId,
            });
          }
        }
      }
      break;
    }
    case StorageType.File: {
      if (project?.instances?.files) {
        Object.keys(project?.instances?.files?.data || {}).forEach((id) => {
          const data = project?.instances?.files?.data?.[id];
          if (data) {
            dict[id] = { id, data, level };
          }
        });
      }
      break;
    }
    case StorageType.Folder: {
      if (project?.instances?.folders) {
        Object.keys(project?.instances?.folders.data).forEach((id) => {
          const data = project?.instances?.folders.data[id];
          if (data) {
            dict[id] = { id, data, level };
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
  permission: Permission,
  project: GameProjectData,
  lookup: DataLookup
): { [refId: string]: InstanceData | FileData | FolderData } => {
  const dict: {
    [refId: string]: { id: string; data: InstanceData; level: number };
  } = {};
  getAllDataInternal(dict, 0, permission, project, lookup);
  const sortedDictValues = orderBy(
    Object.values(dict),
    (value: {
      id: string;
      data: InstanceData | FileData | FolderData;
      level: number;
    }) => value.level
  );
  const sortedDict: {
    [refId: string]: InstanceData | FileData | FolderData;
  } = {};
  sortedDictValues.forEach((value) => {
    sortedDict[value.id] = value.data;
  });
  return sortedDict;
};
