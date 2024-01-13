import { DocumentSource } from "./DocumentSource";

export interface Variable {
  source: DocumentSource;
  name: string;
  type: string;
  value: string;
  compiled: unknown;
}
