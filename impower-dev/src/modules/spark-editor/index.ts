import { h, hydrate } from "preact";
import SparkEditorComponent from "./main/SparkEditor";
import editorIcons from "./styles/icons/icons.css?raw";
import editorTheme from "./styles/theme/theme.css?raw";

const GLOBAL_STYLES = [editorTheme, editorIcons];

export default abstract class SparkEditor {
  static async init(): Promise<void> {
    const sheets = GLOBAL_STYLES.map((cssText) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      return sheet;
    });
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...sheets];
    const root = document.getElementById("root");
    if (root) {
      hydrate(h(SparkEditorComponent, null), root);
    }
  }
}
