import { DataType } from "../../../data";
import { Reference } from "../../../data/interfaces/reference";

export interface InstanceData<
  D extends DataType = DataType,
  R extends Reference<D> = Reference<D>
> extends Record<string, unknown> {
  reference: R;
  line: number;
}

export const isInstanceData = <
  D extends DataType = DataType,
  R extends Reference<D> = Reference<D>
>(
  obj: unknown
): obj is InstanceData<D, R> => {
  if (!obj) {
    return false;
  }
  const instanceData = obj as InstanceData<D, R>;
  return instanceData.reference !== undefined;
};

export const createInstanceData = <
  D extends DataType = DataType,
  R extends Reference<D> = Reference<D>
>(
  obj?: Partial<InstanceData<D, R>> & Pick<InstanceData<D, R>, "reference">
): InstanceData<D, R> => ({
  ...obj,
  line: -1,
});
