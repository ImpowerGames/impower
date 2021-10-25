import { Metadata } from "./metadata";

export interface Data {
  [field: string]: unknown;
}

export interface DataDocument<T extends string = string>
  extends Data,
    Metadata {
  _documentType: T;
}
