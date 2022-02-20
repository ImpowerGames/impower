import {
  getUuid,
  groupBy,
  insertIds,
  insertOrderedCollectionData,
} from "../../../impower-core";
import {
  BlockData,
  CommandData,
  ConfigData,
  ConstructData,
  createBlockData,
  createBlockReference,
  createConstructData,
  createConstructReference,
  ElementData,
  GameProjectData,
  InstanceData,
  isBlockData,
  isConfigData,
  isConstructData,
  isContainerReference,
  isItemReference,
  ParentLookup,
  TriggerData,
  VariableData,
} from "../../data";
import { TriggerInspector } from "../../project/classes/instances/items/trigger/triggerInspector";

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
      case "Construct": {
        const updatedParents: {
          [refId: string]: ConstructData;
        } = parent.parentContainerId
          ? {
              [parent.parentContainerId]: {
                ...createConstructData({
                  reference: createConstructReference({
                    refId: parent.parentContainerId,
                  }),
                }),
                ...newProject?.instances?.constructs?.data[
                  parent.parentContainerId
                ],
                childContainerIds: insertIds(
                  newProject?.instances?.constructs?.data[
                    parent.parentContainerId
                  ].childContainerIds,
                  Object.keys(updated),
                  index
                ),
              },
            }
          : {};
        const updatedData: { [refId: string]: ConstructData } = {};
        Object.entries(updated).forEach(([key, value]) => {
          if (isConstructData(value)) {
            updatedData[key] = value;
          }
        });
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            constructs: {
              ...newProject?.instances?.constructs,
              data: {
                ...newProject?.instances?.constructs?.data,
                ...updatedData,
                ...updatedParents,
              },
            },
          },
        };
        allUpdated[parent.parentContainerId] =
          newProject?.instances?.constructs?.data[parent.parentContainerId];
        allOriginal[parent.parentContainerId] =
          project?.instances?.constructs?.data[parent.parentContainerId];
        break;
      }
      case "Block": {
        const isFirstBlock =
          parent.parentContainerId &&
          !newProject?.instances?.blocks?.data?.[parent.parentContainerId]
            ?.childContainerIds?.length;
        if (isFirstBlock) {
          const firstBlockId = Object.keys(updated)[0];
          if (firstBlockId) {
            const firstBlock = allUpdated?.[firstBlockId] as BlockData;
            if (firstBlock) {
              if (!firstBlock?.triggers?.order?.length) {
                const newEnteredTrigger = TriggerInspector.instance.createData({
                  reference: {
                    parentContainerType: "Block",
                    parentContainerId: firstBlock.reference.refId,
                    refType: "Trigger",
                    refTypeId: "EnteredTrigger",
                    refId: getUuid(),
                  },
                });
                firstBlock.triggers = insertOrderedCollectionData(
                  firstBlock.triggers,
                  {
                    [newEnteredTrigger.reference.refId]: newEnteredTrigger,
                  }
                );
                firstBlock.name = "START";
                allUpdated[firstBlockId] = firstBlock;
              }
            }
          }
        }
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
                childContainerIds: insertIds(
                  newProject?.instances?.blocks?.data[parent.parentContainerId]
                    .childContainerIds,
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
      case "Element": {
        newProject = {
          ...newProject,
          instances: {
            ...newProject?.instances,
            constructs: {
              ...newProject?.instances?.constructs,
              data: {
                ...newProject?.instances?.constructs?.data,
                [parent.parentContainerId]: {
                  ...newProject?.instances?.constructs?.data[
                    parent.parentContainerId
                  ],
                  elements: insertOrderedCollectionData(
                    newProject?.instances?.constructs?.data[
                      parent.parentContainerId
                    ].elements,
                    updated as { [refId: string]: ElementData },
                    index
                  ),
                },
              },
            },
          },
        };
        allUpdated[parent.parentContainerId] =
          newProject?.instances?.constructs?.data[parent.parentContainerId];
        allOriginal[parent.parentContainerId] =
          project?.instances?.constructs?.data[parent.parentContainerId];
        break;
      }
      case "Trigger": {
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
                  triggers: insertOrderedCollectionData(
                    newProject?.instances?.blocks?.data[
                      parent.parentContainerId
                    ].triggers,
                    updated as { [refId: string]: TriggerData },
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
      case "Variable": {
        switch (parent.parentContainerType) {
          case "Construct": {
            newProject = {
              ...newProject,
              instances: {
                ...newProject?.instances,
                constructs: {
                  ...newProject?.instances?.constructs,
                  data: {
                    ...newProject?.instances?.constructs?.data,
                    [parent.parentContainerId]: {
                      ...newProject?.instances?.constructs?.data[
                        parent.parentContainerId
                      ],
                      variables: insertOrderedCollectionData(
                        newProject?.instances?.constructs?.data[
                          parent.parentContainerId
                        ].variables,
                        updated as { [refId: string]: VariableData },
                        index
                      ),
                    },
                  },
                },
              },
            };
            allUpdated[parent.parentContainerId] =
              newProject?.instances?.constructs?.data[parent.parentContainerId];
            allOriginal[parent.parentContainerId] =
              project?.instances?.constructs?.data[parent.parentContainerId];
            break;
          }
          case "Block": {
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
                      variables: insertOrderedCollectionData(
                        newProject?.instances?.blocks?.data[
                          parent.parentContainerId
                        ].variables,
                        updated as { [refId: string]: VariableData },
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
        break;
      }
      default:
        break;
    }
  });

  return { newProject, updated: allUpdated, original: allOriginal };
};
