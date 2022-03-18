import { CommandTypeId } from "../../../project/classes/instances/items/command/commandTypeId";
import { ItemReference } from "./itemReference";

export interface CommandReference<T extends CommandTypeId = CommandTypeId>
  extends ItemReference<"Command"> {
  parentContainerType: "Block";
  refType: "Command";
  refTypeId: T;
}
