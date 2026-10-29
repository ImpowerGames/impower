import { render } from "preact";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import { RouteButton, RouteList } from "./RouteViews";
import type {
  RouteKind,
  RoutePinChange,
  RouteViewState,
  ScriptName,
} from "./routeView";

export interface RouteViewProps {
  state: RouteViewState;
  nameOf: ScriptName;
  onOpen: () => void;
  onClose: () => void;
  onToggle: (kind: RouteKind, shown: boolean) => void;
  onShowLine: (location: DocumentLocation) => void;
  onChangePins: (change: RoutePinChange) => void;
  onPinLastRun: () => void;
}

/** Render the route button and the route list into the places a host gave
 *  them, or take them out of those places when `props` is null. */
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
