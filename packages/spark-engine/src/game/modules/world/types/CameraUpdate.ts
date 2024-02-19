import { RecursivePartial } from "../../../core/types/RecursivePartial";
import { CameraState } from "./CameraState";

export interface CameraUpdate extends RecursivePartial<CameraState> {
  id: string;
}
