import { ItemType } from "../../../../data/enums/data";
import { ItemReference } from "../../../../data/interfaces/references/itemReference";
import { InstanceData } from "../../instance/instanceData";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ItemData<
  D extends ItemType = ItemType,
  R extends ItemReference<D> = ItemReference<D>
> extends InstanceData<D, R> {}
