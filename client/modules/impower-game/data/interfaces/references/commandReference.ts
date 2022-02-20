import { CommandTypeId } from "../../../project/classes/instances/items/command/commandTypeId";
import { isItemReference, ItemReference } from "./itemReference";

export interface CommandReference<T extends CommandTypeId = CommandTypeId>
  extends ItemReference<"Command"> {
  parentContainerType: "Block";
  refType: "Command";
  refTypeId: T;
}

export const isCommandReference = <T extends CommandTypeId = CommandTypeId>(
  obj: unknown
): obj is CommandReference<T> => {
  if (!obj) {
    return false;
  }
  const itemReference = obj as CommandReference<T>;
  return isItemReference(obj) && itemReference.refType === "Command";
};

export const createCommandReference = <T extends CommandTypeId = CommandTypeId>(
  obj?: Partial<CommandReference<T>> & Pick<CommandReference<T>, "refTypeId">
): CommandReference<T> => ({
  parentContainerType: "Block",
  parentContainerId: "",
  refType: "Command",
  refTypeId: "",
  refId: "",
  ...obj,
});
