import { CommandTypeId } from "../../../project/classes/instances/items/command/CommandTypeId";
import { ItemReference } from "./ItemReference";

export interface CommandReference<T extends CommandTypeId = CommandTypeId>
  extends ItemReference<"Command"> {
  type: "Command";
  typeId: T | "";
}
