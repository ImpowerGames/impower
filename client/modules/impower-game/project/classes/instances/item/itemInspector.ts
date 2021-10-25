import { ItemData } from "../../../../data";
import { InstanceInspector } from "../../instance/instanceInspector";

export abstract class ItemInspector<
  T extends ItemData
> extends InstanceInspector<T> {}
