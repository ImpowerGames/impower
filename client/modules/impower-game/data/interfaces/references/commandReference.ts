import { CommandTypeId } from "../../../project/classes/instances/items/command/commandTypeId";
import { ContainerType, ItemType } from "../../enums/data";
import { isItemReference, ItemReference } from "./itemReference";

export interface CommandReference<T extends CommandTypeId = CommandTypeId>
  extends ItemReference<ItemType.Command> {
  parentContainerType: ContainerType.Block;
  refType: ItemType.Command;
  refTypeId: T;
}

export const isCommandReference = <T extends CommandTypeId = CommandTypeId>(
  obj: unknown
): obj is CommandReference<T> => {
  if (!obj) {
    return false;
  }
  const itemReference = obj as CommandReference<T>;
  return isItemReference(obj) && itemReference.refType === ItemType.Command;
};

export const createCommandReference = <T extends CommandTypeId = CommandTypeId>(
  obj?: Partial<CommandReference<T>> & Pick<CommandReference<T>, "refTypeId">
): CommandReference<T> => ({
  parentContainerType: ContainerType.Block,
  parentContainerId: "",
  refType: ItemType.Command,
  refTypeId: "",
  refId: "",
  ...obj,
});
