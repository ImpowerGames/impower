import { uiBuiltinDefinitions } from "../../../spark-engine/src/game/modules/ui/uiBuiltinDefinitions";
import type {
  RenderContext,
  SparkleNode,
} from "../../../sparkle-screen-renderer/src";

const builtinBreakpoints = uiBuiltinDefinitions().config.ui.breakpoints;

export const createScreenRenderContext = (
  components: Record<string, SparkleNode>,
  state: Record<string, any>,
  breakpoints?: Record<string, number> | null,
): RenderContext => ({
  components,
  state,
  options: { breakpoints: breakpoints ?? builtinBreakpoints },
});
