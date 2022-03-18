import { ItemType } from "../../../../data/enums/data";
import { ItemReference } from "../../../../data/interfaces/references/itemReference";
import { createInstanceData } from "../../instance/createInstanceData";
import { ItemData } from "./itemData";

export const createItemData = <
  D extends ItemType = ItemType,
  R extends ItemReference<D> = ItemReference<D>
>(
  obj?: Partial<ItemData<D, R>> & Pick<ItemData<D, R>, "reference">
): ItemData<D, R> => ({
  ...createInstanceData(obj),
  ...obj,
});
