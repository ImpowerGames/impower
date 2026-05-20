import { ComponentSpec } from "./ComponentSpec";
import expandHtml from "./expandHtml.js";
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
  components: Record<string, ComponentSpec>,
  preactRegistry?: PreactRegistry,
): string => {
  const { html, css, js, mjs, cssPath, jsPath, mjsPath } = page;
  let expandedHtml = expandHtml(html || "", components);
  if (preactRegistry && Object.keys(preactRegistry).length > 0) {
    // Pre-render Preact-ported tags into static HTML so the page is fully
    // painted before JS loads (eliminates the FOUC between the empty
    // <se-main-window></se-main-window> shell and Preact hydration).
    //
    // Preact components frequently emit additional spec-component tags
    // (e.g. HeaderNavigation outputs <se-header-menu-button>). The walker
    // expands those inline using the spec-component registry so the
    // serialized output already has the spec content filled in — we can't
    // do this with a second expandHtml pass, because reparsing the full
    // body loses any custom-element tags nested under <se-main-window>'s
    // inline <style> block (parse5 treats style as raw-text, and odd
    // boundaries in there cause the surrounding custom-element tree to
    // be silently dropped on re-serialize).
    expandedHtml = expandPreactComponents(expandedHtml, preactRegistry, {
      specComponents: components,
    });
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
