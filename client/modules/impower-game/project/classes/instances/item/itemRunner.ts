import { ItemData } from "../../../../data";
import { InstanceRunner } from "../../instance/instanceRunner";

export abstract class ItemRunner<
  T extends ItemData
> extends InstanceRunner<T> {}
