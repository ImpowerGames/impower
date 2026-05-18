import { PreactComponent } from "../../preact/PreactComponent";
import Icon, { propDefaults } from "./Icon";

export class IconElement extends PreactComponent(
  Icon,
  "s-icon",
  propDefaults,
  { shadow: false },
) {}

declare global {
  interface HTMLElementTagNameMap {
    "s-icon": IconElement;
  }
}
