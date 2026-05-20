import { PreactComponent } from "@impower/impower-ui/preact";
import Notifications, { propDefaults } from "./Notifications";

export const NotificationsElement = PreactComponent(
  Notifications,
  "se-notifications",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "se-notifications": HTMLElement;
  }
}
