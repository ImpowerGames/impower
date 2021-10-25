import { ContainerData } from "../../data";

const getContainerPathInternal = (
  container: ContainerData,
  containers: { [refId: string]: ContainerData },
  breadcrumbs: string[]
): void => {
  if (!container || !containers) {
    return;
  }
  breadcrumbs.unshift(container.name);

  const parentContainer = containers[container.reference.parentContainerId];
  getContainerPathInternal(parentContainer, containers, breadcrumbs);
};

export const getContainerPath = (
  container: ContainerData,
  containers: { [refId: string]: ContainerData }
): string[] => {
  const breadcrumbs: string[] = [];
  if (!container || !containers) {
    return breadcrumbs;
  }
  breadcrumbs.unshift(container.name);
  const parentContainer = containers[container.reference.parentContainerId];
  getContainerPathInternal(parentContainer, containers, breadcrumbs);
  return breadcrumbs;
};
