import { PreactComponent } from "@impower/impower-ui/preact";
import PreviewGameToolbar, { propDefaults } from "./PreviewGameToolbar";

export const PreviewGameToolbarElement = PreactComponent(
  PreviewGameToolbar,
  "se-preview-game-toolbar",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-preview-game-toolbar": HTMLElement;
  }
}
