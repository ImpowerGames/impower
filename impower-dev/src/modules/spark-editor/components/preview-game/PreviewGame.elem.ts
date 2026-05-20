import { PreactComponent } from "@impower/impower-ui/preact";
import PreviewGame, { propDefaults } from "./PreviewGame";

export const PreviewGameElement = PreactComponent(
  PreviewGame,
  "se-preview-game",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-preview-game": HTMLElement;
  }
}
