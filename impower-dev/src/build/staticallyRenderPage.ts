import {
  expandPreactComponents,
  type ComponentRegistry as PreactRegistry,
} from "./expandPreactComponents.js";
import populateDocument from "./populateDocument.js";

const staticallyRenderPage = (
  documentHtml: string,
  page: {
    css?: string;
    html?: string;
    js?: string;
    mjs?: string;
    cssPath?: string;
    jsPath?: string;
    mjsPath?: string;
  },
  preactRegistry?: PreactRegistry,
): string => {
  const { html, css, js, mjs, cssPath, jsPath, mjsPath } = page;
  let expandedHtml = html || "";
  if (preactRegistry && Object.keys(preactRegistry).length > 0) {
    // Pre-render Preact-ported tags into static HTML so the page is fully
    // painted before JS loads (eliminates the FOUC between the empty
    // <se-main-window></se-main-window> shell and Preact hydration).
    expandedHtml = expandPreactComponents(expandedHtml, preactRegistry);
  }
  return populateDocument(documentHtml, {
    html: expandedHtml,
    css,
    js,
    mjs,
    cssPath,
    jsPath,
    mjsPath,
  });
};

export default staticallyRenderPage;
