import { h, hydrate } from "preact";
import { adoptAll } from "../../../../packages/spec-component/src/component";
import SparkEditorComponent from "./main/SparkEditor";
import editorIcons from "./styles/icons/icons.css";
import editorTheme from "./styles/theme/theme.css";

// Global stylesheets adopted document-wide (constructable stylesheets): the
// editor theme tokens + icon definitions.
const DEFAULT_STYLES = { editorTheme, editorIcons } as const;

export default abstract class SparkEditor {
  static async init(): Promise<void> {
    adoptAll(DEFAULT_STYLES);
    // Plain Preact mount — no custom element. `hydrate` reuses the dev-server
    // SSR pre-render of `#root`, or renders fresh in prod (where `#root` ships
    // empty). Replaces the former preact-custom-element `<spark-editor>` host.
    const root = document.getElementById("root");
    if (root) {
      hydrate(h(SparkEditorComponent, null), root);
    }
  }
}
