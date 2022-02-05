import { IIdentifiable } from "./IIdentifiable";

export interface Argument extends IIdentifiable {
  isByReference: boolean;
  isDivertTarget: boolean;
}
