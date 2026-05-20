import { PreactComponent } from "@impower/impower-ui/preact";
import Preview, { propDefaults } from "./Preview";

export const PreviewElement = PreactComponent(
  Preview,
  "se-preview",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-preview": HTMLElement;
  }
}
