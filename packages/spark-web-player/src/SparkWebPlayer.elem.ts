import { PreactComponent } from "@impower/impower-ui/preact";
import SparkWebPlayer, { propDefaults } from "./SparkWebPlayer";
import cssText from "./spark-web-player.css?inline";

// Light-DOM custom element — inject the stylesheet globally once. Without a
// shadow root we can't use adoptedStyleSheets, and putting `<style>` inside
// the Preact tree fails because the universal selectors in this CSS happen
// to override <style>'s default `display: none`, making its text content
// visible. Injecting into document.head keeps the `<style>` outside the
// element subtree where those rules apply. Browser-only guard for SSR.
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
