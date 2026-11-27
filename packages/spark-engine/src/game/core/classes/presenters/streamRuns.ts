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

function gatheringOf(
  game: Game,
  routed: Instructions,
  events: LayoutInstruction[],
): StreamGathering | undefined {
  const ui = game.module.ui;
  const sparkle = game.program?.sparkle;
  const opened = ui.autoLayoutsAfter(events);
  for (const layout of ui.openedLayoutsAfter(events)) {
    const settings = streamSettings(game, layout);
    if (!opened.includes(layout) && settings.advance !== "auto") {
      continue;
    }
    if (layoutStreams(sparkle, layout).some((node) => streamTemplate(node, routed) >= 0)) {
      return { layout, opened: opened.includes(layout), settings };
    }
  }
  return undefined;
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
    return { ahead: [], open: false };
  }
  const routedFirst = routeLine(game, first);
  let events = layoutEvents(routedFirst);
  const gathering = gatheringOf(game, routedFirst, events);
  if (!gathering) {
    return { ahead: [], open: false };
  }
  const restarts = (own: LayoutInstruction[]) =>
    own.some(
      (event) =>
        event.name === gathering.layout &&
        (event.control === LayoutVerb.clear || event.control === LayoutVerb.close),
    );
  let position = restarts(events) ? 1 : game.module.ui.streams.runLines(gathering.layout) + 1;
  if (endsRun(first, gathering)) {
    return { gathering, ahead: [], open: false, ends: true };
  }
  if (position % RUN_LINE_LIMIT === 0) {
    return { gathering, ahead: [], open: false };
  }
  const ahead: Instructions[] = [];
  for (const [index, beat] of rest.entries()) {
    if (index === rest.length - 1 && pending(beat)) {
      return { gathering, ahead, open: true };
    }
    const routed = routeLine(game, beat, events);
    const own = layoutEvents(routed);
    const after = [...events, ...own];
    if (restarts(own) || gatheringOf(game, routed, after)?.layout !== gathering.layout) {
      return { gathering, ahead, open: false };
    }
    ahead.push(routed);
    events = after;
    position += 1;
    if (endsRun(beat, gathering) || position % RUN_LINE_LIMIT === 0) {
      return { gathering, ahead, open: false };
    }
  }
  return { gathering, ahead, open: true };
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
