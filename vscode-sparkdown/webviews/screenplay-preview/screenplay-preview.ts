import {
  ConnectedPreviewNotification,
  HoveredOffPreviewNotification,
  HoveredOnPreviewNotification,
  LoadedPreviewNotification,
  ScrolledPreviewNotification,
  SelectedPreviewNotification,
} from "@impower/spark-editor-protocol/src/index.js";
import SparkdownScriptPreview from "@impower/sparkdown-script-views/src/modules/preview/index.js";
import Sparkle from "@impower/sparkle/src/index.js";
import { colord } from "colord";

declare var acquireVsCodeApi: any;

const vscode = acquireVsCodeApi();

const css = new CSSStyleSheet();
document.adoptedStyleSheets.push(css);
const updateCssTheme = () => {
  const html = document.querySelector("html");
  if (html) {
    const isLight = document.body.classList.contains("vscode-light");
    const isHighContrastLight = document.body.classList.contains(
      "vscode-high-contrast-light"
    );
    if (isLight || isHighContrastLight) {
      html.classList.remove("s-theme-dark");
      html.classList.add("s-theme-light");
    } else {
      html.classList.remove("s-theme-light");
      html.classList.add("s-theme-dark");
    }
    const styles = window.getComputedStyle(html);
    const buttonBackgroundColor = styles.getPropertyValue(
      "--vscode-button-background"
    );
    const editorBackgroundColor = styles.getPropertyValue(
      "--vscode-editor-background"
    );
    const bgDarkenAmount = isLight || isHighContrastLight ? 0 : 0.075;
    const fgDarkenAmount = isLight || isHighContrastLight ? 0.05 : 0;
    const customButtonBackgroundColor = colord(buttonBackgroundColor)
      .darken(bgDarkenAmount)
      .toHex();
    const customEditorBackgroundColor = colord(editorBackgroundColor)
      .darken(bgDarkenAmount)
      .toHex();
    const customEditorNavigationBackgroundColor = colord(editorBackgroundColor)
      .darken(fgDarkenAmount)
      .toHex();
    css.replaceSync(`
  :root {
    --vscode-custom-button-background: ${customButtonBackgroundColor};
    --vscode-custom-editor-background: ${customEditorBackgroundColor};
    --vscode-custom-editor-navigation-background: ${customEditorNavigationBackgroundColor};
  }
  `);
  }
};
updateCssTheme();
const mutationObserver = new MutationObserver(() => {
  updateCssTheme();
});
mutationObserver.observe(document.body, { childList: false, attributes: true });

const load = async () => {
  await Promise.allSettled([Sparkle.init(), SparkdownScriptPreview.init()]);
};
load();

window.addEventListener("message", (e: MessageEvent) => {
  if (ConnectedPreviewNotification.is(e.data)) {
    vscode.postMessage(e.data);
  }
  if (LoadedPreviewNotification.is(e.data)) {
    document.body.classList.add("ready");
    vscode.setState({ textDocument: e.data.params.textDocument });
    vscode.postMessage(e.data);
  }
  if (ScrolledPreviewNotification.is(e.data)) {
    vscode.postMessage(e.data);
  }
  if (SelectedPreviewNotification.is(e.data)) {
    vscode.postMessage(e.data);
  }
  if (HoveredOnPreviewNotification.is(e.data)) {
    vscode.postMessage(e.data);
  }
  if (HoveredOffPreviewNotification.is(e.data)) {
    vscode.postMessage(e.data);
  }
});
