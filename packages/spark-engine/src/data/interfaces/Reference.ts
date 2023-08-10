import { DataType } from "../enums/Data";

export interface Reference<D extends DataType = DataType> {
  id: string;
  typeId: string;
  type: D;
  parentId?: string;
}
