import { DocumentSource } from "../../../core/types/DocumentSource";

export interface VariableData {
  source: DocumentSource;
  name: string;
  type: string;
  value: string;
  compiled: unknown;
}
