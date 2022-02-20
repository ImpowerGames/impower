import { Disableable } from "../../../../../data/interfaces/disableable";
import {
  CommandReference,
  createCommandReference,
  isCommandReference,
} from "../../../../../data/interfaces/references/commandReference";
import { createItemData, ItemData } from "../../item/itemData";
import { CommandTypeId } from "./commandTypeId";

export interface CommandData<T extends CommandTypeId = CommandTypeId>
  extends ItemData<"Command", CommandReference<T>>,
    Disableable {
  waitUntilFinished: boolean;
}

export const isCommandData = <T extends CommandTypeId = CommandTypeId>(
  obj: unknown
): obj is CommandData<T> => {
  if (!obj) {
    return false;
  }
  const commandData = obj as CommandData<T>;
  return isCommandReference(commandData.reference);
};

export const createCommandData = <T extends CommandTypeId = CommandTypeId>(
  obj?: Partial<CommandData<T>> & Pick<CommandData<T>, "reference">
): CommandData<T> => ({
  ...createItemData({
    reference: createCommandReference(),
  }),
  waitUntilFinished: true,
  disabled: false,
  ...obj,
});
