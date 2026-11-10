import { useEffect } from "preact/hooks";
import route from "../../workspace/route/RouteStore";
import RouteListView from "./RouteListView";

export const ROUTE_PANEL_ID = "route-panel";

export default function RoutePanel() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => route.dismiss(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <section
      id={ROUTE_PANEL_ID}
      aria-label="Route"
      class="flex h-full min-h-0 flex-col border-t border-solid border-edge"
    >
      <RouteListView class="min-h-0 flex-1 overflow-auto bg-panel" />
    </section>
  );
}
