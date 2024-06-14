import { DocumentSource } from "../../../core/types/DocumentSource";
import { FlowLocation } from "./FlowLocation";

export interface ExecutionData extends FlowLocation {
  source?: DocumentSource;
}
