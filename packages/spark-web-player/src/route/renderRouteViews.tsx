import { render } from "preact";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import { RouteButton, RouteList } from "./RouteViews";
import type {
  RouteKind,
  RoutePinChange,
  RouteViewState,
  ScriptName,
} from "./routeView";
import type { RouteTab } from "./startingValuesView";
import type { StartingValuesEvents } from "./StartingValuesViews";

export interface RouteViewProps {
  state: RouteViewState;
  nameOf: ScriptName;
  onOpen: () => void;
  onClose: () => void;
  onToggle: (kind: RouteKind, shown: boolean) => void;
  onShowLine: (location: DocumentLocation) => void;
  onTab?: (tab: RouteTab) => void;
  values?: StartingValuesEvents;
  onChangePins: (change: RoutePinChange) => void;
}

export const renderRouteViews = (
  targets: { button: HTMLElement | null; list: HTMLElement | null },
  props: RouteViewProps | null,
): void => {
  if (targets.button) {
    render(props ? <RouteButton {...props} /> : null, targets.button);
  }
  if (targets.list) {
    render(props ? <RouteList {...props} /> : null, targets.list);
  }
};
