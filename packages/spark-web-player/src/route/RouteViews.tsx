import {
  Button,
  CloseIcon,
  ListRow,
  PanelHead,
  Tab,
  Tabs,
} from "@impower/impower-ui/components";
import { useId, useLayoutEffect, useState } from "preact/hooks";
import { useRouteListStylesheet } from "./routeListStylesheet";
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
  lastRunText,
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
  onOpen: () => void;
  onClose: () => void;
}

export function RouteButton({ state, nameOf, onOpen, onClose }: RouteButtonProps) {
  useRouteListStylesheet();
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
  onToggle: (kind: RouteKind, shown: boolean) => void;
  onShowLine: (location: DocumentLocation) => void;
  onTab?: (tab: RouteTab) => void;
  values?: StartingValuesEvents;
  onChangePins: (change: RoutePinChange) => void;
  onPinLastRun: () => void;
}

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

const ROUTE_TAB_CLASS =
  "ml-0.5 flex-none font-normal first:ml-0 data-[state=active]:font-semibold data-[state=active]:shadow-[inset_0_-2px_0_var(--accent)]";

const ROUTE_KIND_COLOURS: Record<RouteKind, string> = {
  pinned: "text-accent",
  auto: "text-muted",
  forced: "text-warning",
  clipped: "text-warning",
};

export function RouteList({
  state,
  nameOf,
  onClose,
  onToggle,
  onShowLine,
  onTab,
  values,
  onChangePins,
  onPinLastRun,
}: RouteListProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const tabsId = useId();
  useRouteListStylesheet();
  const drafts = state.values?.drafts;
  useLayoutEffect(() => {
    if (!state.open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      const target = event.target;
      const key =
        target instanceof Element
          ? target.closest(".sv-row")?.getAttribute("data-key")
          : null;
      if (key != null && drafts?.[key] !== undefined) {
        return;
      }
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.open, drafts, onClose]);
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
  const lastRun = state.lastRun ?? 0;
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
      data-route-line
      class="relative control-overlay mr-[var(--list-row-compact-gap)] flex min-h-[var(--list-row-compact-height)] min-w-[3em] flex-none cursor-pointer items-center justify-end self-stretch rounded-control px-1.5 text-accent tabular-nums focus-inset"
      title={`Go to line ${location.range.start.line + 1} of ${nameOf(location.uri)}`}
      onClick={() => onShowLine(location)}
    >
      {location.range.start.line + 1}
    </button>
  );
  const tabId = (value: RouteTab) => `${tabsId}-tab-${value}`;
  const panelId = (value: RouteTab) => `${tabsId}-panel-${value}`;
  return (
    <section class="route-list" aria-label={routeTitle}>
      <PanelHead
        size="compact"
        edge={false}
        class="sticky top-0 z-1 bg-panel"
        title={
          <Tabs
            value={tab}
            onChange={(value) => onTab?.(value as RouteTab)}
            iconLayout="beside"
            indicator="none"
            class="w-auto"
          >
            <Tab
              value="route"
              id={tabId("route")}
              controls={panelId("route")}
              class={ROUTE_TAB_CLASS}
            >
              {routeTitle}
            </Tab>
            {valuesState ? (
              <Tab
                value="values"
                id={tabId("values")}
                controls={panelId("values")}
                class={ROUTE_TAB_CLASS}
              >
                <span class="inline-flex items-center gap-[var(--tab-gap)]">
                  <StartingValuesTabLabel state={valuesState} />
                </span>
              </Tab>
            ) : null}
          </Tabs>
        }
        end={
          <Button
            variant="quiet"
            size="icon"
            class="size-[var(--control-size)] flex-none text-muted [&_svg]:size-3.5"
            aria-label="Close the route"
            title="Close"
            onClick={onClose}
          >
            <CloseIcon />
          </Button>
        }
      />
      {valuesState ? (
        <div
          role="tabpanel"
          id={panelId("values")}
          aria-labelledby={tabId("values")}
          hidden={tab !== "values"}
        >
          {tab === "values" && values ? (
            <StartingValuesTab state={valuesState} events={values} />
          ) : null}
        </div>
      ) : null}
      {tab === "values" && valuesState && values ? (
        <div
          role="tabpanel"
          id={panelId("route")}
          aria-labelledby={tabId("route")}
          hidden
        />
      ) : (
        <div
          class="route-tab-body"
          role="tabpanel"
          id={panelId("route")}
          aria-labelledby={tabId("route")}
        >
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
                    <li key={key} data-route-entry data-kind={decision.kind}>
                      <div data-impower-ui>
                        <ListRow
                          size="compact"
                          leading={lineLink(decision.location)}
                          icon={
                            <span
                              class={`flex flex-none forced-colors:text-[CanvasText] ${ROUTE_KIND_COLOURS[decision.kind]}`}
                            >
                              <RouteIconSvg icon={decision.kind} />
                            </span>
                          }
                          label={
                            choice ? (
                              <button
                                type="button"
                                data-route-text
                                class="relative control-overlay block w-full cursor-pointer rounded-control px-1 py-[3px] text-left leading-[normal] [mask-image:linear-gradient(to_left,transparent_0,#000_16px)] focus-inset"
                                aria-expanded={open}
                                title={
                                  open
                                    ? "Hide the pin control"
                                    : "Pin the option taken here"
                                }
                                onClick={() =>
                                  setExpanded({ ...expanded, [key]: !open })
                                }
                              >
                                {decisionText(decision)}
                              </button>
                            ) : (
                              <span data-route-text>
                                {decisionText(decision)}
                              </span>
                            )
                          }
                          trailing={
                            <span
                              data-route-badge
                              class="ml-auto flex-none text-muted"
                            >
                              {ROUTE_KIND_LABELS[decision.kind]}
                            </span>
                          }
                        />
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
                <li data-route-entry>
                  <div data-impower-ui>
                    <ListRow
                      size="compact"
                      leading={lineLink(route.target)}
                      label={
                        <span data-route-text>
                          {route.tunnelEnds
                            ? "Tunnel ends here, with nothing to return to in the preview"
                            : "Target line"}
                        </span>
                      }
                    />
                  </div>
                </li>
              </ol>
              {unresolved.length > 0 ? (
                <ul
                  class="route-unresolved-pins"
                  aria-label="Pins with no option"
                >
                  {unresolved.map((pin) => (
                    <li
                      key={`${pin.uri}:${pin.line}:${pin.offer}`}
                      class="route-unresolved-pin"
                    >
                      <RouteIconSvg icon="pinned" />
                      <span class="route-text">
                        {unresolvedPinText(pin, nameOf)}
                      </span>
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
                <p class="route-list-note">
                  The preview runs this line as the game does
                </p>
              ) : null}
            </>
          )}
          {state.pinNote ? (
            <p class="route-list-note route-pin-note" role="status">
              {state.pinNote}
            </p>
          ) : null}
          {hidden > 0 || state.pins.length > 0 || lastRun > 0 ? (
            <footer class="route-list-foot">
              {hidden > 0 ? (
                <span>{`${hidden} hidden by the toggles`}</span>
              ) : null}
              {lastRun > 0 ? (
                <button
                  type="button"
                  class="route-pin-last-run"
                  onClick={onPinLastRun}
                >
                  {lastRunText(lastRun)}
                </button>
              ) : null}
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
