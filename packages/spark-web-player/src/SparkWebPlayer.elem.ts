/// <reference path="./declaration.d.ts" />
import { PreactComponent } from "@impower/impower-ui/preact";
import SparkWebPlayer, { propDefaults } from "./SparkWebPlayer";
import cssText from "./spark-web-player.css?inline";

if (
  typeof document !== "undefined" &&
  !document.getElementById("spark-web-player-css")
) {
  const style = document.createElement("style");
  style.id = "spark-web-player-css";
  style.textContent = cssText;
  document.head.appendChild(style);
}

export const SparkWebPlayerElement = PreactComponent(
  SparkWebPlayer,
  "spark-web-player",
  propDefaults,
  { shadow: false },
);

declare global {
  interface HTMLElementTagNameMap {
    "spark-web-player": HTMLElement;
  }
}
