import { CommandReference } from "../../../../../data/interfaces/references/commandReference";
import { ItemData } from "../../item/itemData";
import { CommandTypeId } from "./commandTypeId";

export interface CommandData<T extends CommandTypeId = CommandTypeId>
  extends ItemData<"Command", CommandReference<T>> {
  waitUntilFinished: boolean;
  assets?: string[];
}
