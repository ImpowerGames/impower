import { DataType, ContainerType } from "../enums/data";

export interface DataLookup {
  parentContainerType?: ContainerType;
  parentContainerId?: string;
  refType: DataType;
  refTypeId?: string;
}
