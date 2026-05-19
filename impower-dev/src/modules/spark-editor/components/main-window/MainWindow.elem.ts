import { PreactComponent } from "@impower/impower-ui/preact";
import MainWindow, { propDefaults } from "./MainWindow";

export const MainWindowElement = PreactComponent(
  MainWindow,
  "se-main-window",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-main-window": HTMLElement;
  }
}
