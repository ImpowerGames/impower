import { ItemData } from "../../../../data";
import { InstanceRunner } from "../../instance/InstanceRunner";

export abstract class ItemRunner<
  T extends ItemData
> extends InstanceRunner<T> {}
