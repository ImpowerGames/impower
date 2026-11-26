import {
  getComponents,
  parseSparkle,
  renderCssVDOM,
  renderHtmlVDOM,
} from "../../../sparkle-screen-renderer/src";
import { createScreenRenderContext } from "./createScreenRenderContext";
import { getScreenTheme } from "./getScreenTheme";

export interface ScreenPreviewLoadParams {
  text: string;
  breakpoints?: Record<string, number> | null;
  eases?: Record<string, string> | null;
  sharedCSS?: Record<string, string>;
}

export const loadScreenPreview = ({
  text,
  breakpoints,
  eases,
  sharedCSS,
}: ScreenPreviewLoadParams) => {
  const parsed = parseSparkle(text);
  const components = getComponents(parsed);
  return {
    parsed,
    render: (state: Record<string, any>) => {
      const theme = getScreenTheme(
        parsed,
        components,
        state,
        sharedCSS ?? {},
        breakpoints,
        eases,
      );
      const ctx = createScreenRenderContext(
        components,
        state,
        theme,
        breakpoints,
        eases,
      );
      return {
        css: renderCssVDOM(parsed, ctx),
        html: renderHtmlVDOM(parsed, ctx),
      };
    },
  };
};
