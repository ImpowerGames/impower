import { Metadata } from "./metadata";

export interface DataDocument<T extends string = string>
  extends Record<string, unknown>,
    Metadata {
  _documentType: T;
}
