import { Nameable } from "../../../../../impower-core";
import { ContainerType, ItemType } from "../../../../data/enums/data";
import {
  ContainerReference,
  isContainerReference,
} from "../../../../data/interfaces/references/containerReference";
import { createInstanceData, InstanceData } from "../../instance/instanceData";

export interface ContainerData<
  D extends ContainerType = ContainerType,
  R extends ContainerReference<D> = ContainerReference<D>
> extends InstanceData<D, R>,
    Nameable {
  childContainerIds: string[];
}

export const isContainerData = (obj: unknown): obj is ContainerData => {
  if (!obj) {
    return false;
  }
  const containerData = obj as ContainerData;
  return (
    isContainerReference(containerData.reference) &&
    containerData.childContainerIds !== undefined
  );
};

export const createContainerData = <
  D extends ContainerType = ContainerType,
  R extends ContainerReference<D> = ContainerReference<D>
>(
  obj?: Partial<ContainerData<D, R>> & Pick<ContainerData<D, R>, "reference">
): ContainerData<D, R> => ({
  ...createInstanceData(obj),
  name: "NewContainer",
  childContainerIds: [],
  ...obj,
});

export const getItemsField = (itemType: ItemType): string => {
  return itemType === ItemType.Element
    ? "elements"
    : itemType === ItemType.Trigger
    ? "triggers"
    : itemType === ItemType.Command
    ? "commands"
    : itemType === ItemType.Variable
    ? "variables"
    : "";
};
