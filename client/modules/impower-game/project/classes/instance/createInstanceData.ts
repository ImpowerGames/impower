import { DataType } from "../../../data/enums/data";
import { Reference } from "../../../data/interfaces/reference";
import { InstanceData } from "./instanceData";

export const createInstanceData = <
  D extends DataType = DataType,
  R extends Reference<D> = Reference<D>
>(
  obj?: Partial<InstanceData<D, R>> & Pick<InstanceData<D, R>, "reference">
): InstanceData<D, R> => ({
  ...obj,
  pos: -1,
  line: -1,
  indent: -1,
});
