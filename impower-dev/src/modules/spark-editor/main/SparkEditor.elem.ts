import { PreactComponent } from "@impower/impower-ui/preact";
import SparkEditor, { propDefaults } from "./SparkEditor";

export const SparkEditorElement = PreactComponent(
  SparkEditor,
  "spark-editor",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "spark-editor": HTMLElement;
  }
}
