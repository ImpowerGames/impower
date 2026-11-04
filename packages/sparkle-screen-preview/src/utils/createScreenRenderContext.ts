import { uiBuiltinDefinitions } from "../../../spark-engine/src/game/modules/ui/uiBuiltinDefinitions";
import type {
  RenderContext,
  SparkleNode,
} from "../../../sparkle-screen-renderer/src";
import type { ThemeVariables } from "../../../sparkle-style-transformer/src/types/themeVariables";

const breakpoints = uiBuiltinDefinitions().config.ui.breakpoints;

export const createScreenRenderContext = (
  components: Record<string, SparkleNode>,
  state: Record<string, any>,
  theme: ThemeVariables,
): RenderContext => ({
  components,
  state,
  options: { breakpoints, theme },
});
