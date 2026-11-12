import { h, type ComponentChildren } from "preact";
import routeViewCss from "./route-view.css?inline";

const STYLE_ID = "swp-route-view-css";

if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = routeViewCss;
  document.head.appendChild(style);
}

export default function PlayerViewScope({
  class: className,
  children,
}: {
  class?: string;
  children?: ComponentChildren;
}) {
  return h("swp-route-view", { class: className }, children);
}
