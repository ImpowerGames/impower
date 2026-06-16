import { adoptAll } from "../../../../packages/spec-component/src/component";
import { SparkEditorElement } from "./main/SparkEditor.elem";
import editorIcons from "./styles/icons/icons.css";
import editorTheme from "./styles/theme/theme.css";

const DEFAULT_STYLES = { editorTheme, editorIcons } as const;

export default abstract class SparkEditor {
  static async init(): Promise<void> {
    adoptAll(DEFAULT_STYLES);
    // Only one custom element remains: <spark-editor> (the page root in
    // pages/index.html). Everything else — including the sparkdown-
    // document-views script editor and screenplay preview — is rendered
    // as a direct Preact import.
    await SparkEditorElement.register();
  }
}
