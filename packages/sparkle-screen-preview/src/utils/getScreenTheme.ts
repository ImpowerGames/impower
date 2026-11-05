import {
  renderCssVDOM,
  type SparkleNode,
  type VNode,
} from "../../../sparkle-screen-renderer/src";
import type { ThemeVariables } from "../../../sparkle-style-transformer/src/types/themeVariables";
import { getThemeVariables } from "../../../sparkle-style-transformer/src/utils/getThemeVariables";
import { createScreenRenderContext } from "./createScreenRenderContext";

const getText = (node: VNode): string =>
  typeof node === "string" ? node : node.children.map(getText).join("\n");

export const getScreenTheme = (
  parsed: SparkleNode[],
  components: Record<string, SparkleNode>,
  state: Record<string, any>,
  sharedCSS: Record<string, string>,
  breakpoints?: Record<string, number> | null,
): ThemeVariables => {
  const shared = getThemeVariables(...Object.values(sharedCSS));
  const css = renderCssVDOM(
    parsed.filter((node) => node.type === "theme" || node.type === "animation"),
    createScreenRenderContext(components, state, shared, breakpoints),
  );
  return new Set([...shared, ...getThemeVariables(getText(css))]);
};
