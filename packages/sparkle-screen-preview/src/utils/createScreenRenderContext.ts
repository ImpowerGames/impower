import breakpoints from "../../../spark-engine/src/game/modules/ui/builtinBreakpoints.json";
import type {
  RenderContext,
  SparkleNode,
} from "../../../sparkle-screen-renderer/src";

export const createScreenRenderContext = (
  components: Record<string, SparkleNode>,
  state: Record<string, any>,
): RenderContext => ({
  components,
  state,
  options: { breakpoints },
});
