import { LayoutVerb } from "@impower/sparkdown/language/sparkdown.layout-verbs";
import { layoutStreams } from "@impower/sparkdown/src/compiler/utils/layoutStreams";
import { streamTemplate } from "../../../modules/ui/utils/streamTemplate";
import type { LayoutInstruction } from "../../types/Instruction";
import type { Instructions } from "../../types/Instructions";
import { getTimeValue } from "../../utils/getTimeValue";
import type { Game } from "../Game";
import { layoutEvents, routeLine } from "./textLayouts";

export interface StreamSettings {
  advance: "click" | "auto";
  pause: number;
}

export interface StreamGathering {
  layout: string;
  opened: boolean;
  settings: StreamSettings;
}

export interface StreamLane {
  gathering: StreamGathering;
  ahead: Instructions[];
  ends: boolean;
  waits: boolean;
}

export interface StreamRun {
  lanes: Map<string, StreamLane>;
  open: boolean;
}

const BUILT_IN_PAUSE = 0.4;

const RUN_LINE_LIMIT = 100;

const streamLayouts = new WeakMap<object, boolean>();

function holdsStreams(game: Game): boolean {
  const sparkle = game.program?.sparkle;
  if (!sparkle) {
    return false;
  }
  let holds = streamLayouts.get(sparkle);
  if (holds === undefined) {
    holds = Object.keys(sparkle.layouts ?? {}).some(
      (layout) => layoutStreams(sparkle, layout).length > 0,
    );
    streamLayouts.set(sparkle, holds);
  }
  return holds;
}

export function streamSettings(game: Game, layout: string): StreamSettings {
  const streams = (game.context as Record<string, any> | undefined)?.["stream"];
  const own =
    streams && Object.hasOwn(streams, layout) ? streams[layout] : streams?.["$default"];
  const pause = getTimeValue(own?.pause);
  return {
    advance: own?.advance === "auto" ? "auto" : "click",
    pause: pause !== undefined && pause >= 0 ? pause : BUILT_IN_PAUSE,
  };
}

function gatheringsOf(
  game: Game,
  routed: Instructions,
  events: LayoutInstruction[],
): StreamGathering[] {
  const ui = game.module.ui;
  const sparkle = game.program?.sparkle;
  const opened = ui.autoLayoutsAfter(events);
  return ui.openedLayoutsAfter(events).flatMap((layout) => {
    const settings = streamSettings(game, layout);
    if (!opened.includes(layout) && settings.advance !== "auto") {
      return [];
    }
    return layoutStreams(sparkle, layout).some((node) => streamTemplate(node, routed) >= 0)
      ? [{ layout, opened: opened.includes(layout), settings }]
      : [];
  });
}

const pending = (beat: Instructions): boolean =>
  !beat.text && !beat.load && !beat.cutscene && !(beat.choices?.length ?? 0);

const endsRun = (beat: Instructions, gathering: StreamGathering): boolean =>
  Boolean(beat.hold) ||
  (beat.choices?.length ?? 0) > 0 ||
  (!gathering.opened && Boolean(beat.waits));

const restarts = (own: LayoutInstruction[], layout: string): boolean =>
  own.some(
    (event) =>
      event.name === layout &&
      (event.control === LayoutVerb.clear || event.control === LayoutVerb.close),
  );

export function streamRun(game: Game, beats: readonly Instructions[]): StreamRun {
  const [first, ...rest] = beats;
  const lanes = new Map<string, StreamLane>();
  if (!first || !holdsStreams(game)) {
    return { lanes, open: false };
  }
  const routedFirst = routeLine(game, first);
  let events = layoutEvents(routedFirst);
  const positions = new Map<string, number>();
  for (const gathering of gatheringsOf(game, routedFirst, events)) {
    const position = restarts(events, gathering.layout)
      ? 1
      : game.module.ui.streams.runLines(gathering.layout) + 1;
    const ends = endsRun(first, gathering);
    lanes.set(gathering.layout, {
      gathering,
      ahead: [],
      ends,
      waits: ends || position % RUN_LINE_LIMIT === 0,
    });
    if (!lanes.get(gathering.layout)!.waits) {
      positions.set(gathering.layout, position);
    }
  }
  for (const [index, beat] of rest.entries()) {
    if (positions.size === 0) {
      return { lanes, open: false };
    }
    if (index === rest.length - 1 && pending(beat)) {
      return { lanes, open: true };
    }
    const routed = routeLine(game, beat, events);
    const own = layoutEvents(routed);
    const after = [...events, ...own];
    const receiving = new Set(
      gatheringsOf(game, routed, after)
        .map((gathering) => gathering.layout)
        .filter((layout) => !restarts(own, layout)),
    );
    for (const [layout, position] of [...positions]) {
      const lane = lanes.get(layout)!;
      if (!receiving.has(layout)) {
        positions.delete(layout);
        continue;
      }
      lane.ahead.push(routed);
      if (endsRun(beat, lane.gathering) || (position + 1) % RUN_LINE_LIMIT === 0) {
        positions.delete(layout);
      } else {
        positions.set(layout, position + 1);
      }
    }
    events = after;
  }
  return { lanes, open: positions.size > 0 };
}

export function markRun(
  game: Game,
  beat: Instructions,
  queued: readonly Instructions[],
): Instructions {
  const { auto: _auto, pause: _pause, ...plain } = beat;
  const lanes = [...streamRun(game, [plain, ...queued]).lanes.values()];
  const advances =
    lanes.length > 0 &&
    lanes.every(
      (lane) =>
        lane.gathering.settings.advance === "auto" && !lane.waits && lane.ahead.length > 0,
    ) &&
    !plain.waits &&
    !plain.hold &&
    !(plain.choices?.length ?? 0);
  if (advances) {
    return {
      ...plain,
      auto: true,
      pause: Math.max(...lanes.map((lane) => lane.gathering.settings.pause)),
    };
  }
  return beat.auto === undefined && beat.pause === undefined ? beat : plain;
}
