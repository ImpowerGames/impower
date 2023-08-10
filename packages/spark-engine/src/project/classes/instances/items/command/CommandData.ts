import { CommandReference } from "../../../../../data/interfaces/references/CommandReference";
import { ItemData } from "../../item/ItemData";
import { CommandParams } from "./CommandParams";
import { CommandTypeId } from "./CommandTypeId";

export interface CommandData<
  T extends CommandTypeId = CommandTypeId,
  P extends CommandParams = CommandParams
> extends ItemData<"Command", CommandReference<T>> {
  params: P;
}
