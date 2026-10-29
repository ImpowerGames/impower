import { useState } from "preact/hooks";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import type {
  PreviewRouteDecision,
  PreviewRouteOption,
  RoutePin,
} from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { RouteIconSvg } from "./RouteIcons";
import {
  choiceSentence,
  decisionText,
  isPinned,
  kindCounts,
  pinChange,
  stopIsPinned,
  unpinChange,
  unresolvedPinText,
  type RoutePinChange,
  ROUTE_KIND_LABELS,
  ROUTE_KIND_MEANINGS,
  ROUTE_KINDS,
  routeIcon,
  routeLabel,
  routeLabelParts,
  routeTitle,
  type RouteKind,
  type RouteViewState,
  type ScriptName,
} from "./routeView";
import type { RouteTab } from "./startingValuesView";
import {
  StartingValuesTab,
  StartingValuesTabLabel,
  type StartingValuesEvents,
} from "./StartingValuesViews";

export interface RouteButtonProps {
  state: RouteViewState;
  nameOf: ScriptName;
  /** The author asked for the route list. */
  onOpen: () => void;
  /** The author asked to close it. */
  onClose: () => void;
}

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
      {icon ? (
        <RouteIconSvg icon={icon} />
      ) : (
        <span class="route-icon route-icon-slot" aria-hidden="true" />
      )}
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
  onTab?: (tab: RouteTab) => void;
  values?: StartingValuesEvents;
  /** The author pinned, unpinned or removed pins. */
  onChangePins: (change: RoutePinChange) => void;
}

/** A choice entry's pin control: what the preview did at the stop, the
 *  options offered there in script order with the one taken marked, each
 *  with Pin or Pinned, and Unpin when the stop has a pin. */
function PinControl({
  decision,
  target,
  pins,
  onChangePins,
}: {
  decision: PreviewRouteDecision;
  target: DocumentLocation;
  pins: RoutePin[];
  onChangePins: (change: RoutePinChange) => void;
}) {
  const taken = (option: PreviewRouteOption) =>
    option.location.uri === decision.location.uri &&
    option.location.range.start.line === decision.location.range.start.line;
  return (
    <div class="route-pin-control">
      <p class="route-pin-sentence">{choiceSentence(decision, target)}</p>
      <ul class="route-pin-options">
        {(decision.options ?? []).map((option) => {
          const pinned = isPinned(pins, option);
          return (
            <li
              key={`${option.location.range.start.line}:${option.offer}`}
              class={taken(option) ? "route-pin-option taken" : "route-pin-option"}
            >
              <span class="route-pin-option-text">{option.text}</span>
              {taken(option) ? (
                <span class="route-pin-taken">Taken</span>
              ) : null}
              <button
                type="button"
                class="route-pin-button"
                aria-pressed={pinned}
                title={pinned ? "Unpin this option" : "Pin this option here"}
                onClick={() =>
                  onChangePins(pinChange(pins, decision, option))
                }
              >
                <RouteIconSvg icon="pinned" />
                <span>{pinned ? "Pinned" : "Pin"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {stopIsPinned(pins, decision) ? (
        <button
          type="button"
          class="route-pin-unpin"
          onClick={() => onChangePins(unpinChange(pins, decision))}
        >
          Unpin
        </button>
      ) : null}
    </div>
  );
}

export function RouteList({
  state,
  nameOf,
  onClose,
  onToggle,
  onShowLine,
  onTab,
  values,
  onChangePins,
}: RouteListProps) {
  // Which entries the author expanded or collapsed, by stop.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!state.open) {
    return null;
  }
  const route = state.route;
  const target = route?.target ?? state.failure?.target;
  const routeTitle = target
    ? `Route to line ${target.range.start.line + 1}`
    : "Route";
  const valuesState = values ? state.values : undefined;
  const tab: RouteTab = valuesState ? state.tab : "route";
  const counts = kindCounts(route);
  const decisions = route?.decisions ?? [];
  const shown = decisions.filter((d) => state.toggles[d.kind]);
  const hidden = decisions.length - shown.length;
  const unresolved = route?.unresolvedPins ?? [];
  // An entry is known by its stop: the menu it met, by where it is met, and
  // which meeting of that menu it is. A pin that changes the option taken
  // there, or the options a gate lets it offer, leaves it as it was, so the
  // control the author pressed stays open.
  const keys = new Map<PreviewRouteDecision, string>();
  const meetings = new Map<string, number>();
  for (const decision of decisions) {
    const at =
      decision.menu ?? decision.options?.[0]?.location ?? decision.location;
    const stop = `${decision.options ? "menu" : decision.kind}:${at.uri}:${at.range.start.line}`;
    const meeting = (meetings.get(stop) ?? 0) + 1;
    meetings.set(stop, meeting);
    keys.set(decision, `${stop}:${meeting}`);
  }
  const entryKey = (decision: PreviewRouteDecision) => keys.get(decision)!;
  const isExpanded = (decision: PreviewRouteDecision) =>
    expanded[entryKey(decision)] ?? Boolean(decision.notFollowed);
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
    <section class="route-list" aria-label={routeTitle}>
      <header class="route-list-head">
        <div class="route-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="route-tab"
            data-tab="route"
            aria-selected={tab === "route"}
            onClick={() => onTab?.("route")}
          >
            <span class="route-list-title">{routeTitle}</span>
          </button>
          {valuesState ? (
            <button
              type="button"
              role="tab"
              class="route-tab"
              data-tab="values"
              aria-selected={tab === "values"}
              onClick={() => onTab?.("values")}
            >
              <StartingValuesTabLabel state={valuesState} />
            </button>
          ) : null}
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
      {tab === "values" && valuesState && values ? (
        <StartingValuesTab state={valuesState} events={values} />
      ) : (
        <div class="route-tab-body" role={valuesState ? "tabpanel" : undefined}>
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
          {state.failure || !route ? (
            <p class="route-list-failure">{state.failure?.message ?? ""}</p>
          ) : (
            <>
              <ol class="route-list-entries">
                {shown.map((decision) => {
                  const key = entryKey(decision);
                  const choice = decision.options != null;
                  const open = choice && isExpanded(decision);
                  return (
                    <li
                      key={key}
                      class={open ? "route-entry expanded" : "route-entry"}
                      data-kind={decision.kind}
                    >
                      <div class="route-entry-row">
                        {lineLink(decision.location)}
                        <RouteIconSvg icon={decision.kind} />
                        {choice ? (
                          <button
                            type="button"
                            class="route-text route-entry-toggle"
                            aria-expanded={open}
                            title={open ? "Hide the pin control" : "Pin the option taken here"}
                            onClick={() =>
                              setExpanded({ ...expanded, [key]: !open })
                            }
                          >
                            {decisionText(decision)}
                          </button>
                        ) : (
                          <span class="route-text">{decisionText(decision)}</span>
                        )}
                        <span class="route-badge">{ROUTE_KIND_LABELS[decision.kind]}</span>
                      </div>
                      {open ? (
                        <PinControl
                          decision={decision}
                          target={route.target}
                          pins={state.pins}
                          onChangePins={onChangePins}
                        />
                      ) : null}
                    </li>
                  );
                })}
                <li class="route-entry route-target">
                  <div class="route-entry-row">
                    {lineLink(route.target)}
                    <span class="route-text">Target line</span>
                  </div>
                </li>
              </ol>
              {unresolved.length > 0 ? (
                <ul class="route-unresolved-pins" aria-label="Pins with no option">
                  {unresolved.map((pin) => (
                    <li
                      key={`${pin.uri}:${pin.line}:${pin.offer}`}
                      class="route-unresolved-pin"
                    >
                      <RouteIconSvg icon="pinned" />
                      <span class="route-text">{unresolvedPinText(pin, nameOf)}</span>
                      <button
                        type="button"
                        class="route-pin-remove"
                        onClick={() => onChangePins({ remove: [pin] })}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {decisions.length === 0 ? (
                <p class="route-list-note">The preview runs this line as the game does</p>
              ) : null}
            </>
          )}
          {state.pinNote ? (
            <p class="route-list-note route-pin-note" role="status">
              {state.pinNote}
            </p>
          ) : null}
          {hidden > 0 || state.pins.length > 0 ? (
            <footer class="route-list-foot">
              {hidden > 0 ? <span>{`${hidden} hidden by the toggles`}</span> : null}
              {state.pins.length > 0 ? (
                <button
                  type="button"
                  class="route-clear-pins"
                  onClick={() => onChangePins({ removeAll: true })}
                >
                  Clear pins
                </button>
              ) : null}
            </footer>
          ) : null}
        </div>
      )}
    </section>
  );
}
