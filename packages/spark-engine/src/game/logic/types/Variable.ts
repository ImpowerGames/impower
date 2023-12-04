import { DocumentSource } from "./DocumentSource";

export interface Variable {
  source?: DocumentSource;
  stored: boolean;
  name: string;
  type: string;
  value: string;
  compiled: unknown;
}
