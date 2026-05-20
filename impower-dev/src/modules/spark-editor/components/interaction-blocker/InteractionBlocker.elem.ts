import { PreactComponent } from "@impower/impower-ui/preact";
import InteractionBlocker, { propDefaults } from "./InteractionBlocker";

export const InteractionBlockerElement = PreactComponent(
  InteractionBlocker,
  "se-interaction-blocker",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-interaction-blocker": HTMLElement;
  }
}
