import routeListCss from "@impower/spark-web-player/src/route/route-list.css?inline";
import { RouteList } from "@impower/spark-web-player/src/route/RouteViews";
import savesCss from "@impower/spark-web-player/src/saves/saves.css?inline";
import type { HostedValuesEvent } from "@impower/spark-web-player/src/route/routeViewMessages";
import type { StartingValuesEvents } from "@impower/spark-web-player/src/route/StartingValuesViews";
import { h } from "preact";
import { useEffect } from "preact/hooks";
import { useComputed } from "@preact/signals";
import route, { routeScriptName } from "../../workspace/route/RouteStore";
import routeViewCss from "./route-view.css?inline";

const STYLE_ID = "swp-route-view-css";

if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = routeListCss + savesCss + routeViewCss;
  document.head.appendChild(style);
}

const valuesAction = (event: HostedValuesEvent) =>
  route.act({ kind: "values", event });

export default function RouteListView({ class: className }: { class?: string }) {
  const view = useComputed(() => route.view.value).value;
  useEffect(() => {
    const dismiss = (event: KeyboardEvent | PointerEvent) =>
      route.dismissLoadMenu(event);
    window.addEventListener("keydown", dismiss, true);
    window.addEventListener("pointerdown", dismiss, true);
    return () => {
      window.removeEventListener("keydown", dismiss, true);
      window.removeEventListener("pointerdown", dismiss, true);
    };
  }, []);
  if (!view) {
    return null;
  }
  const load = view.load;
  const values: StartingValuesEvents | undefined = view.values
    ? {
        onSet: (key, value) => valuesAction({ kind: "set", key, value }),
        onClear: (key) => valuesAction({ kind: "clear", key }),
        onDraft: (key, text) => valuesAction({ kind: "draft", key, text }),
        onResetAll: () => valuesAction({ kind: "resetAll" }),
        onSearch: (search) => valuesAction({ kind: "search", search }),
        onUndoLoad: () => valuesAction({ kind: "undoLoad" }),
        load: load
          ? {
              saves: load.saves,
              open: load.open,
              onOpen: (open) => valuesAction({ kind: "loadOpen", open }),
              onPick: (id) => valuesAction({ kind: "loadPick", id }),
            }
          : undefined,
      }
    : undefined;
  return h(
    "swp-route-view",
    { class: className },
    <RouteList
      state={{ ...view, open: true }}
      nameOf={routeScriptName}
      onClose={() => route.close()}
      onToggle={(kind, shown) =>
        route.act({ kind: "toggle", routeKind: kind, shown })
      }
      onShowLine={(location) => route.showLine(location)}
      onTab={(tab) => route.act({ kind: "tab", tab })}
      values={values}
      onChangePins={(change) => route.act({ kind: "changePins", change })}
      onPinLastRun={() => route.act({ kind: "pinLastRun" })}
    />,
  );
}
