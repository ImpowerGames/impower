import { PreactComponent } from "@impower/impower-ui/preact";
import LogicScriptEditor, { propDefaults } from "./LogicScriptEditor";

export const LogicScriptEditorElement = PreactComponent(
  LogicScriptEditor,
  "se-logic-script-editor",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-logic-script-editor": HTMLElement;
  }
}
