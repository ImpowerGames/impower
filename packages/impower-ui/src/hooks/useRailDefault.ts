import type { RailDefault } from "../layout/breakpoints";
import { railState } from "../layout/media";
import { useMediaState } from "./useMediaState";

export function useRailDefault(): RailDefault {
  return useMediaState(railState);
}
