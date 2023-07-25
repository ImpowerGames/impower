import { ComponentState } from "./ComponentState.js";
import expandHtml from "./expandHtml.js";
import populateDocument from "./populateDocument.js";

const renderPage = (
  documentHtml: string,
  pageComponent: () => {
    css?: string;
    html?: string;
    js?: string;
    mjs?: string;
    cssPath?: string;
    jsPath?: string;
    mjsPath?: string;
  },
  components?: Record<
    string,
    (state?: ComponentState) => { css?: string; html?: string; js?: string }
  >
): string => {
  const { html, css, js, mjs, cssPath, jsPath, mjsPath } = pageComponent();
  const expandedHtml = expandHtml(html || "", { components });
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

export default renderPage;
