import { DataType } from "../../../data";
import { Reference } from "../../../data/interfaces/reference";

export interface InstanceData<
  D extends DataType = DataType,
  R extends Reference<D> = Reference<D>
> extends Record<string, unknown> {
  reference: R;
  pos: number;
  line: number;
}
