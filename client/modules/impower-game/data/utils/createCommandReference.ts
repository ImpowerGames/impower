import { CommandTypeId } from "../../project/classes/instances/items/command/commandTypeId";
import { CommandReference } from "../interfaces/references/commandReference";

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
