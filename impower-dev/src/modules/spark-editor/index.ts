import { h, hydrate } from "preact";
import SparkEditorComponent from "./main/SparkEditor";
import editorIcons from "./styles/icons/icons.css";
import editorTheme from "./styles/theme/theme.css";

// Global stylesheets adopted document-wide as constructable stylesheets: the
// editor theme tokens + icon definitions.
const GLOBAL_STYLES = [editorTheme, editorIcons];

export default abstract class SparkEditor {
  static async init(): Promise<void> {
    const sheets = GLOBAL_STYLES.map((cssText) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      return sheet;
    });
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...sheets];
    // Plain Preact mount — no custom element. `hydrate` reuses the dev-server
    // SSR pre-render of `#root`, or renders fresh in prod (where `#root` ships
    // empty). Replaces the former preact-custom-element `<spark-editor>` host.
    const root = document.getElementById("root");
    if (root) {
      hydrate(h(SparkEditorComponent, null), root);
    }
  }
}
