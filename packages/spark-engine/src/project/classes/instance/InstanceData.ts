import { DataType } from "../../../data";
import { Reference } from "../../../data/interfaces/Reference";

export interface InstanceData<
  D extends DataType = DataType,
  R extends Reference<D> = Reference<D>
> extends Record<string, unknown> {
  reference: R;
  source: {
    file: string;
    line: number;
    from: number;
    to: number;
  };
  indent: number;
}
