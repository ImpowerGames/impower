import { DocumentSource } from "./DocumentSource";
import { FlowLocation } from "./FlowLocation";

export interface ExecutionData extends FlowLocation {
  source?: DocumentSource;
}
