import { PreactComponent } from "@impower/impower-ui/preact";
import PreviewToggleButton, { propDefaults } from "./PreviewToggleButton";

export const PreviewToggleButtonElement = PreactComponent(
  PreviewToggleButton,
  "se-preview-toggle-button",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-preview-toggle-button": HTMLElement;
  }
}
