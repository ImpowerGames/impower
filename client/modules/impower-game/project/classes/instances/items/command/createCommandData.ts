import { createCommandReference } from "../../../../../data/utils/createCommandReference";
import { createItemData } from "../../item/createItemData";
import { CommandData } from "./commandData";
import { CommandTypeId } from "./commandTypeId";

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
