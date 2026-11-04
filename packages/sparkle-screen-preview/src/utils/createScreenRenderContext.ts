import breakpoints from "../../../spark-engine/src/game/modules/ui/builtinBreakpoints.json";
import type {
  RenderContext,
  SparkleNode,
} from "../../../sparkle-screen-renderer/src";
import type { ThemeVariables } from "../../../sparkle-style-transformer/src/types/themeVariables";

export const createScreenRenderContext = (
  components: Record<string, SparkleNode>,
  state: Record<string, any>,
  theme: ThemeVariables,
): RenderContext => ({
  components,
  state,
  options: { breakpoints, theme },
});
