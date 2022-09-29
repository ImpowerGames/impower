import { ContainerType, DataType } from "../enums/Data";

export interface DataLookup {
  parentContainerType?: ContainerType;
  parentContainerId?: string;
  refType: DataType;
  refTypeId?: string;
}
