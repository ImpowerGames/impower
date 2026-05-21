import { PreactComponent } from "@impower/impower-ui/preact";
import LogicScriptsEditor, { propDefaults } from "./LogicScriptsEditor";

export const LogicScriptsEditorElement = PreactComponent(
  LogicScriptsEditor,
  "se-logic-scripts-editor",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-logic-scripts-editor": HTMLElement;
  }
}
