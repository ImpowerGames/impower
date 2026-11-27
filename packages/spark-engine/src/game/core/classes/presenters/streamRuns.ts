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

export interface StreamRun {
  gathering?: StreamGathering;
  ahead: Instructions[];
  lanes: Record<string, Instructions[]>;
  open: boolean;
  ends?: true;
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

export function streamRun(game: Game, beats: readonly Instructions[]): StreamRun {
  const [first, ...rest] = beats;
  if (!first || !holdsStreams(game)) {
    return { ahead: [], lanes: {}, open: false };
  }
  const routedFirst = routeLine(game, first);
  let events = layoutEvents(routedFirst);
  const gatherings = gatheringsOf(game, routedFirst, events);
  const gathering = gatherings[0];
  if (!gathering) {
    return { ahead: [], lanes: {}, open: false };
  }
  const lanes: Record<string, Instructions[]> = Object.fromEntries(
    gatherings.map((g) => [g.layout, []]),
  );
  const ahead = lanes[gathering.layout]!;
  const run = (open: boolean): StreamRun => ({ gathering, ahead, lanes, open });
  const restarts = (own: LayoutInstruction[], layout: string) =>
    own.some(
      (event) =>
        event.name === layout &&
        (event.control === LayoutVerb.clear || event.control === LayoutVerb.close),
    );
  let position = restarts(events, gathering.layout)
    ? 1
    : game.module.ui.streams.runLines(gathering.layout) + 1;
  if (endsRun(first, gathering)) {
    return { ...run(false), ends: true };
  }
  if (position % RUN_LINE_LIMIT === 0) {
    return run(false);
  }
  const stopped = new Set<string>();
  for (const [index, beat] of rest.entries()) {
    if (index === rest.length - 1 && pending(beat)) {
      return run(true);
    }
    const routed = routeLine(game, beat, events);
    const own = layoutEvents(routed);
    const after = [...events, ...own];
    const receiving = new Set(
      gatheringsOf(game, routed, after)
        .map((g) => g.layout)
        .filter((layout) => !restarts(own, layout)),
    );
    if (!receiving.has(gathering.layout)) {
      return run(false);
    }
    for (const [layout, lane] of Object.entries(lanes)) {
      if (stopped.has(layout)) {
        continue;
      }
      if (receiving.has(layout)) {
        lane.push(routed);
      } else {
        stopped.add(layout);
      }
    }
    events = after;
    position += 1;
    if (endsRun(beat, gathering) || position % RUN_LINE_LIMIT === 0) {
      return run(false);
    }
  }
  return run(true);
}

export function markRun(
  game: Game,
  beat: Instructions,
  queued: readonly Instructions[],
): Instructions {
  const { auto: _auto, pause: _pause, ...plain } = beat;
  const run = streamRun(game, [plain, ...queued]);
  const advances =
    run.gathering?.settings.advance === "auto" &&
    run.ahead.length > 0 &&
    !plain.waits &&
    !plain.hold &&
    !(plain.choices?.length ?? 0);
  if (advances) {
    return { ...plain, auto: true, pause: run.gathering!.settings.pause };
  }
  return beat.auto === undefined && beat.pause === undefined ? beat : plain;
}
