import { PreactComponent } from "@impower/impower-ui/preact";
import Assets, { propDefaults } from "./Assets";

export const AssetsElement = PreactComponent(
  Assets,
  "se-assets",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-assets": HTMLElement;
  }
}
