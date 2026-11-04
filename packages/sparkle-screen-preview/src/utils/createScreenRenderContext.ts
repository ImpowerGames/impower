import { uiBuiltinDefinitions } from "../../../spark-engine/src/game/modules/ui/uiBuiltinDefinitions";
import type {
  RenderContext,
  SparkleNode,
} from "../../../sparkle-screen-renderer/src";

const breakpoints = uiBuiltinDefinitions().config.ui.breakpoints;

export const createScreenRenderContext = (
  components: Record<string, SparkleNode>,
  state: Record<string, any>,
): RenderContext => ({
  components,
  state,
  options: { breakpoints },
});
