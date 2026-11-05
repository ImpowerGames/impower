import { pointerState } from "../layout/media";
import { useMediaState } from "./useMediaState";

export function useCoarsePointer(): boolean {
  return useMediaState(pointerState) === "coarse";
}
