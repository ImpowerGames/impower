import {
  ConfigType,
  ContainerType,
  FileData,
  FolderData,
  GameProjectData,
  InstanceData,
  isItemReference,
  ItemType,
  Reference,
  StorageType,
} from "../../data";
import { getVariableContainer } from "./getVariableContainer";

export const getData = (
  reference: Reference,
  project: GameProjectData
): InstanceData | FileData | FolderData => {
  if (!project) {
    return undefined;
  }
  if (!reference) {
    throw new Error(`No reference specified`);
  }
  if (!reference.refId) {
    return undefined;
  }
  switch (reference.refType) {
    case ConfigType.Config: {
      return project?.instances?.configs?.data[reference.refId];
    }
    case ContainerType.Construct:
      return project?.instances?.constructs?.data[reference.refId];
    case ContainerType.Block:
      return project?.instances?.blocks?.data[reference.refId];
    case ItemType.Element: {
      if (isItemReference(reference)) {
        if (reference.parentContainerId) {
          const construct =
            project?.instances?.constructs?.data[reference.parentContainerId];
          if (!construct) {
            return undefined;
          }
          return construct.elements?.data[reference.refId];
        }
        const construct = Object.values(
          project?.instances?.constructs?.data
        ).find((c) => {
          return c.elements?.data[reference.refId];
        });
        if (construct) {
          return construct.elements?.data[reference.refId];
        }
      }
      return undefined;
    }
    case ItemType.Trigger: {
      if (isItemReference(reference)) {
        const block =
          project?.instances?.blocks?.data[reference.parentContainerId];
        if (!block) {
          return undefined;
        }
        return block.triggers?.data[reference.refId];
      }
      return undefined;
    }
    case ItemType.Command: {
      if (isItemReference(reference)) {
        const block =
          project?.instances?.blocks?.data[reference.parentContainerId];
        if (!block) {
          return undefined;
        }
        return block.commands?.data[reference.refId];
      }
      return undefined;
    }
    case ItemType.Variable: {
      if (isItemReference(reference)) {
        if (reference.parentContainerId) {
          const container = getVariableContainer(
            project,
            reference.parentContainerType,
            reference.parentContainerId
          );
          if (!container) {
            return undefined;
          }
          return container.variables?.data[reference.refId];
        }
        if (reference.parentContainerType === ContainerType.Block) {
          const container = Object.values(
            project?.instances?.blocks?.data
          ).find((c) => {
            return c.variables?.data[reference.refId];
          });
          if (container) {
            return container.variables?.data[reference.refId];
          }
        }
        if (reference.parentContainerType === ContainerType.Construct) {
          const container = Object.values(
            project?.instances?.constructs?.data
          ).find((c) => {
            return c.variables?.data[reference.refId];
          });
          if (container) {
            return container.variables?.data[reference.refId];
          }
        }
      }
      return undefined;
    }
    case StorageType.File: {
      if (project?.instances?.files) {
        return project?.instances?.files?.data?.[reference.refId];
      }
      break;
    }
    case StorageType.Folder: {
      if (project?.instances?.folders) {
        return project?.instances?.folders.data[reference.refId];
      }
      break;
    }
    default:
      return undefined;
  }
  return undefined;
};
