import { PreactComponent } from "@impower/impower-ui/preact";
import Logic, { propDefaults } from "./Logic";

export const LogicElement = PreactComponent(
  Logic,
  "se-logic",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-logic": HTMLElement;
  }
}
