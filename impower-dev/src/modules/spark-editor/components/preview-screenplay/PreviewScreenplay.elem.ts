import { PreactComponent } from "@impower/impower-ui/preact";
import PreviewScreenplay, { propDefaults } from "./PreviewScreenplay";

export const PreviewScreenplayElement = PreactComponent(
  PreviewScreenplay,
  "se-preview-screenplay",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-preview-screenplay": HTMLElement;
  }
}
