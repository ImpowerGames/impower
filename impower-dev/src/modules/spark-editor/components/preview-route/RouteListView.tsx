import routeListCss from "@impower/spark-web-player/src/route/route-list.css?inline";
import { RouteList } from "@impower/spark-web-player/src/route/RouteViews";
import { h } from "preact";
import { useComputed } from "@preact/signals";
import route, { routeScriptName } from "../../workspace/route/RouteStore";
import routeViewCss from "./route-view.css?inline";

const STYLE_ID = "swp-route-view-css";

if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = routeListCss + routeViewCss;
  document.head.appendChild(style);
}

export default function RouteListView({ class: className }: { class?: string }) {
  const view = useComputed(() => route.view.value).value;
  if (!view) {
    return null;
  }
  return h(
    "swp-route-view",
    { class: className },
    <RouteList
      state={{ ...view, open: true, tab: "route" }}
      nameOf={routeScriptName}
      onClose={() => route.close()}
      onToggle={(kind, shown) =>
        route.act({ kind: "toggle", routeKind: kind, shown })
      }
      onShowLine={(location) => route.showLine(location)}
      onChangePins={(change) => route.act({ kind: "changePins", change })}
      onPinLastRun={() => route.act({ kind: "pinLastRun" })}
    />,
  );
}
