import { type ComponentType, h } from "preact";
import { renderToString } from "preact-render-to-string";
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
  rootComponent?: ComponentType<any>,
): string => {
  const { html, css, js, mjs, cssPath, jsPath, mjsPath } = page;
  let expandedHtml = html || "";
  if (rootComponent) {
    try {
      const rendered = renderToString(h(rootComponent, null));
      expandedHtml = expandedHtml.replace(
        /<div id="root">\s*<\/div>/,
        `<div id="root">${rendered}</div>`,
      );
    } catch (err) {
      console.warn(
        "[staticallyRenderPage] root SSR failed:",
        err instanceof Error ? err.message : err,
      );
    }
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
