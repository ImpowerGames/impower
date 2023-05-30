import { ContainerType, DataType } from "../enums/Data";

export interface Reference<D extends DataType = DataType> {
  refId: string;
  refTypeId: string;
  refType: D;
  parentContainerId?: string;
  parentContainerType?: ContainerType;
}
