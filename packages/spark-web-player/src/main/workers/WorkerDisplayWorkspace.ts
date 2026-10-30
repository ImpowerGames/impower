import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import type { WorkerGameLink } from "./WorkerGameLink";

export interface PreviewPoint {
  file: string;
  line: number;
}

export interface WorkerHang {
  busyMs: number;
  location: DocumentLocation | null;
  previewWithheld: boolean;
}

export interface WorkerDisplayWorkspace {
  gameLink: WorkerGameLink;
  programHeld(program: string): Promise<void>;
  addWorkerHangListener(listener: (hang: WorkerHang) => void): () => void;
  isSetAside(point: PreviewPoint): boolean;
}
