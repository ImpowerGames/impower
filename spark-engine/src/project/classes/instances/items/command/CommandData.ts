import { CommandReference } from "../../../../../data/interfaces/references/CommandReference";
import { ItemData } from "../../item/ItemData";
import { CommandTypeId } from "./CommandTypeId";

export interface CommandData<T extends CommandTypeId = CommandTypeId>
  extends ItemData<"Command", CommandReference<T>> {
  waitUntilFinished: boolean;
  assets?: string[];
}
