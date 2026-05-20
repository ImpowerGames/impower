import { PreactComponent } from "@impower/impower-ui/preact";
import Share, { propDefaults } from "./Share";

export const ShareElement = PreactComponent(
  Share,
  "se-share",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-share": HTMLElement;
  }
}
