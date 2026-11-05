import { h, render } from "preact";
import SparkEditorComponent from "./main/SparkEditor";
import editorTheme from "./styles/theme/theme.css?raw";

export default abstract class SparkEditor {
  static async init(): Promise<void> {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(editorTheme);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const root = document.getElementById("root");
    if (root) {
      render(h(SparkEditorComponent, null), root);
    }
  }
}
