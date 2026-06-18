import { PreactComponent } from "@impower/impower-ui/preact";
import SparkdownScriptEditor, {
  propDefaults,
} from "./SparkdownScriptEditor";

export const SparkdownScriptEditorElement = PreactComponent(
  SparkdownScriptEditor,
  "sparkdown-script-editor",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "sparkdown-script-editor": HTMLElement;
  }
}
