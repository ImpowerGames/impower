import type { Layout } from "../layout/breakpoints";
import { layoutState } from "../layout/media";
import { useMediaState } from "./useMediaState";

export function useLayout(): Layout {
  return useMediaState(layoutState);
}
