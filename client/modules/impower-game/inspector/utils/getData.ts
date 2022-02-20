import {
  FileData,
  FolderData,
  GameProjectData,
  InstanceData,
  isItemReference,
  Reference,
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
    case "Config": {
      return project?.instances?.configs?.data[reference.refId];
    }
    case "Construct":
      return project?.instances?.constructs?.data[reference.refId];
    case "Block":
      return project?.instances?.blocks?.data[reference.refId];
    case "Element": {
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
    case "Trigger": {
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
    case "Command": {
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
    case "Variable": {
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
        if (reference.parentContainerType === "Block") {
          const container = Object.values(
            project?.instances?.blocks?.data
          ).find((c) => {
            return c.variables?.data[reference.refId];
          });
          if (container) {
            return container.variables?.data[reference.refId];
          }
        }
        if (reference.parentContainerType === "Construct") {
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
    case "File": {
      if (project?.instances?.files) {
        return project?.instances?.files?.data?.[reference.refId];
      }
      break;
    }
    case "Folder": {
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
