import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import { RouteIconSvg } from "./RouteIcons";
import {
  decisionText,
  kindCounts,
  ROUTE_KIND_LABELS,
  ROUTE_KIND_MEANINGS,
  ROUTE_KINDS,
  routeIcon,
  routeLabel,
  routeLabelParts,
  routeStartText,
  routeTitle,
  type RouteKind,
  type RouteViewState,
  type ScriptName,
} from "./routeView";

/*
 * The route button and the route list render from a state object
 * (`RouteViewState`) and say what the author did through their events. They
 * know nothing of the host: the player's toolbar is one place to put them,
 * and any host that hears the route over the bridge can put them elsewhere.
 * Their colours come from the `--swp-route-*` variables, whose defaults are
 * the player's own.
 */

export interface RouteButtonProps {
  state: RouteViewState;
  nameOf: ScriptName;
  /** The author asked for the route list. */
  onOpen: () => void;
  /** The author asked to close it. */
  onClose: () => void;
}

/** The route the preview took, `interrogation (4 → 21)`, with the status
 *  icon that says how it differs from play. A press opens the route list,
 *  and a second press closes it. */
export function RouteButton({ state, nameOf, onOpen, onClose }: RouteButtonProps) {
  const label = routeLabel(state, nameOf);
  const parts = routeLabelParts(state, nameOf);
  if (label === null || parts === null) {
    return null;
  }
  const icon = routeIcon(state);
  const title = routeTitle(state, nameOf);
  return (
    <button
      type="button"
      class={state.failure ? "route-button failed" : "route-button"}
      aria-expanded={state.open}
      aria-label={`${label}. ${title}`}
      title={title}
      // A press on the button is not a drag of whatever bar holds it.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => (state.open ? onClose() : onOpen())}
    >
      {icon ? <RouteIconSvg icon={icon} /> : null}
      <span class="route-button-label">
        <span class="route-button-name">{parts.name}</span>
        <span class="route-button-lines">{` ${parts.lines}`}</span>
      </span>
    </button>
  );
}

export interface RouteListProps {
  state: RouteViewState;
  nameOf: ScriptName;
  onClose: () => void;
  /** The author showed or hid a kind. */
  onToggle: (kind: RouteKind, shown: boolean) => void;
  /** The author asked to see a line. */
  onShowLine: (location: DocumentLocation) => void;
}

/** The route's decisions in route order, between where it starts and the
 *  line it ends at, filtered by the toggles; or why there is no route. */
export function RouteList({
  state,
  nameOf,
  onClose,
  onToggle,
  onShowLine,
}: RouteListProps) {
  if (!state.open) {
    return null;
  }
  const route = state.route;
  const target = route?.target ?? state.failure?.target;
  const counts = kindCounts(route);
  const decisions = route?.decisions ?? [];
  const shown = decisions.filter((d) => state.toggles[d.kind]);
  const hidden = decisions.length - shown.length;
  const lineLink = (location: DocumentLocation) => (
    <button
      type="button"
      class="route-line"
      title={`Go to line ${location.range.start.line + 1} of ${nameOf(location.uri)}`}
      onClick={() => onShowLine(location)}
    >
      {location.range.start.line + 1}
    </button>
  );
  return (
    <section
      class="route-list"
      aria-label={target ? `Route to line ${target.range.start.line + 1}` : "Route"}
    >
      <header class="route-list-head">
        <span class="route-list-title">
          {target ? `Route to line ${target.range.start.line + 1}` : "Route"}
        </span>
        <div class="route-list-toggles" role="group" aria-label="Show">
          {ROUTE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              class="route-toggle"
              data-kind={kind}
              aria-pressed={state.toggles[kind]}
              title={ROUTE_KIND_MEANINGS[kind]}
              onClick={() => onToggle(kind, !state.toggles[kind])}
            >
              <RouteIconSvg icon={kind} />
              <span>{ROUTE_KIND_LABELS[kind]}</span>
              <span class="route-toggle-count">{counts[kind]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          class="route-list-close"
          aria-label="Close the route"
          title="Close"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {state.failure || !route ? (
        <p class="route-list-failure">{state.failure?.message ?? ""}</p>
      ) : (
        <>
          <ol class="route-list-entries">
            <li class="route-entry route-start">
              {lineLink(route.start.location)}
              <span class="route-text">{routeStartText(route, nameOf)}</span>
            </li>
            {shown.map((decision, index) => (
              <li key={index} class="route-entry" data-kind={decision.kind}>
                {lineLink(decision.location)}
                <RouteIconSvg icon={decision.kind} />
                <span class="route-text">{decisionText(decision)}</span>
                <span class="route-badge">{ROUTE_KIND_LABELS[decision.kind]}</span>
              </li>
            ))}
            <li class="route-entry route-target">
              {lineLink(route.target)}
              <span class="route-text">Target line</span>
            </li>
          </ol>
          {decisions.length === 0 ? (
            <p class="route-list-note">The preview runs this line as the game does</p>
          ) : null}
          {hidden > 0 ? (
            <p class="route-list-foot">{`${hidden} hidden by the toggles`}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
