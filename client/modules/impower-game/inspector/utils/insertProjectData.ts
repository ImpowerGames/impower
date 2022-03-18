import {
  groupBy,
  insertIds,
  insertOrderedCollectionData,
} from "../../../impower-core";
import {
  BlockData,
  CommandData,
  ConfigData,
  createBlockData,
  createBlockReference,
  GameProjectData,
  InstanceData,
  isBlockData,
  isConfigData,
  isContainerReference,
  isItemReference,
  ParentLookup,
} from "../../data";

export const insertGameProjectData = (
  project: GameProjectData,
  newData: InstanceData[],
  validateData: (
    project: GameProjectData,
    newData: InstanceData[]
  ) => {
    updated: { [refId: string]: InstanceData };
    original: { [refId: string]: InstanceData };
  },
  index?: number
): {
  newProject: GameProjectData;
  updated: { [refId: string]: InstanceData };
  original: { [refId: string]: InstanceData };
} => {
  let newProject: GameProjectData = { ...project };
  let allOriginal: { [refId: string]: InstanceData } = {};
  let allUpdated: { [refId: string]: InstanceData } = {};

  const groupedData = groupBy(newData, (d: InstanceData) => {
    if (isContainerReference(d.reference) || isItemReference(d.reference)) {
      return `${d.reference.parentContainerId}${d.reference.refType}`;
    }
    return "";
  });

  Object.values(groupedData).forEach((newDataList) => {
    const firstNewData = newDataList[0];
    const parent = {
      ...firstNewData.reference,
    } as ParentLookup;
    const { refType } = firstNewData.reference;

    const { updated, original } = validateData(newProject, newDataList);
    allUpdated = { ...allUpdated, ...updated };
    allOriginal = { ...allOriginal, ...original };

    switch (refType) {
      case "Config": {
        const updatedData: { [refId: string]: ConfigData } = {};
        Object.entries(updated).forEach(([key, value]) => {
          if (isConfigData(value)) {
            updatedData[key] = value;
          }
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
      case "Block": {
        const updatedParents: {
          [refId: string]: BlockData;
        } = parent.parentContainerId
          ? {
              [parent.parentContainerId]: {
                ...createBlockData({
                  reference: createBlockReference({
                    refId: parent.parentContainerId,
                  }),
                  name: "ROOT",
                }),
                ...newProject?.instances?.blocks?.data[
                  parent.parentContainerId
                ],
                children: insertIds(
                  newProject?.instances?.blocks?.data[parent.parentContainerId]
                    .children,
                  Object.keys(updated),
                  index
                ),
              },
            }
          : {};
        const updatedData: { [refId: string]: BlockData } = {};
        Object.entries(updated).forEach(([key, value]) => {
          if (isBlockData(value)) {
            updatedData[key] = value;
          }
        });
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            blocks: {
              ...newProject?.instances?.blocks,
              data: {
                ...newProject?.instances?.blocks?.data,
                ...updatedData,
                ...updatedParents,
              },
            },
          },
        };
        allUpdated[parent.parentContainerId] =
          newProject?.instances?.blocks?.data[parent.parentContainerId];
        allOriginal[parent.parentContainerId] =
          project?.instances?.blocks?.data[parent.parentContainerId];
        break;
      }
      case "Command": {
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            blocks: {
              ...newProject?.instances?.blocks,
              data: {
                ...newProject?.instances?.blocks?.data,
                [parent.parentContainerId]: {
                  ...newProject?.instances?.blocks?.data[
                    parent.parentContainerId
                  ],
                  commands: insertOrderedCollectionData(
                    newProject?.instances?.blocks?.data[
                      parent.parentContainerId
                    ].commands,
                    updated as { [refId: string]: CommandData },
                    index
                  ),
                },
              },
            },
          },
        };
        allUpdated[parent.parentContainerId] =
          newProject?.instances?.blocks?.data[parent.parentContainerId];
        allOriginal[parent.parentContainerId] =
          project?.instances?.blocks?.data[parent.parentContainerId];
        break;
      }
      default:
        break;
    }
  });

  return { newProject, updated: allUpdated, original: allOriginal };
};
