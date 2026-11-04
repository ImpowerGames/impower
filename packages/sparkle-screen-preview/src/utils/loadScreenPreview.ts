import {
  getComponents,
  parseSparkle,
  renderCssVDOM,
  renderHtmlVDOM,
} from "../../../sparkle-screen-renderer/src";
import { createScreenRenderContext } from "./createScreenRenderContext";

export interface ScreenPreviewLoadParams {
  text: string;
  breakpoints?: Record<string, number> | null;
}

export const loadScreenPreview = ({ text, breakpoints }: ScreenPreviewLoadParams) => {
  const parsed = parseSparkle(text);
  const components = getComponents(parsed);
  return {
    parsed,
    render: (state: Record<string, any>) => {
      const ctx = createScreenRenderContext(components, state, breakpoints);
      return {
        css: renderCssVDOM(parsed, ctx),
        html: renderHtmlVDOM(parsed, ctx),
      };
    },
  };
};
