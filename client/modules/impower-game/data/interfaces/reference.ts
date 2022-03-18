import { ContainerType, DataType } from "../enums/data";

export interface Reference<D extends DataType = DataType> {
  refId: string;
  refTypeId: string;
  refType: D;
  parentContainerId?: string;
  parentContainerType?: ContainerType;
}
