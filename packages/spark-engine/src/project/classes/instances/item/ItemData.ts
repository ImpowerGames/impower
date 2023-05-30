import { ItemType } from "../../../../data/enums/Data";
import { ItemReference } from "../../../../data/interfaces/references/ItemReference";
import { InstanceData } from "../../instance/InstanceData";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ItemData<
  D extends ItemType = ItemType,
  R extends ItemReference<D> = ItemReference<D>
> extends InstanceData<D, R> {}
