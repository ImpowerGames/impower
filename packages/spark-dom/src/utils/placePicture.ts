export interface PictureFramingValues {
  x: number;
  y: number;
  zoom: number;
}

export interface PictureView {
  x: number;
  ownX: number;
  y: number;
  ownY: number;
  zoom: number;
}

const decimal = (value: number) => String(Number(value.toFixed(6)));

const axis = (layerAt: number, ownAt: number, extent: "cqw" | "cqh") => {
  const layer = Number((layerAt * 100).toFixed(6));
  const own = Number((ownAt * 100).toFixed(6));
  const terms = [
    ...(layer === 0 ? [] : [{ value: layer, unit: extent }]),
    ...(own === 0 ? [] : [{ value: -own, unit: "%" }]),
  ];
  if (terms.length === 0) {
    return "0px";
  }
  if (terms.length === 1) {
    return `${decimal(terms[0]!.value)}${terms[0]!.unit}`;
  }
  const [first, second] = terms as [{ value: number; unit: string }, { value: number; unit: string }];
  const sign = second.value < 0 ? "-" : "+";
  return `calc(${decimal(first.value)}${first.unit} ${sign} ${decimal(Math.abs(second.value))}${second.unit})`;
};

export const getPictureView = (framing: PictureFramingValues | undefined): PictureView => {
  const { x, y, zoom } = framing ?? { x: 0.5, y: 0.5, zoom: 1 };
  return { x, ownX: 0.5 + zoom * (x - 0.5), y, ownY: 0.5 + zoom * (y - 0.5), zoom };
};

export const mixPictureViews = (from: PictureView, to: PictureView, progress: number): PictureView => {
  const mix = (a: number, b: number) => a + (b - a) * progress;
  return {
    x: mix(from.x, to.x),
    ownX: mix(from.ownX, to.ownX),
    y: mix(from.y, to.y),
    ownY: mix(from.ownY, to.ownY),
    zoom: mix(from.zoom, to.zoom),
  };
};

export const getViewPlacement = (view: PictureView): { translate: string; scale: string } => ({
  translate: `${axis(view.x, view.ownX, "cqw")} ${axis(view.y, view.ownY, "cqh")}`,
  scale: decimal(view.zoom),
});

export const getPicturePlacement = (
  framing: PictureFramingValues | undefined,
): { translate: string | null; scale: string | null } => {
  if (!framing) {
    return { translate: null, scale: null };
  }
  const placement = getViewPlacement(getPictureView(framing));
  return {
    translate: placement.translate,
    scale: framing.zoom === 1 ? null : placement.scale,
  };
};

export const writePlacement = (
  el: HTMLElement,
  placement: { translate: string | null; scale: string | null },
) => {
  for (const [property, value] of Object.entries(placement)) {
    if (value == null) {
      el.style.removeProperty(property);
    } else {
      el.style.setProperty(property, value);
    }
  }
};

export interface PlayedTravel {
  animation: Animation;
  drop: () => void;
}

interface Travel extends PlayedTravel {
  from: PictureView;
  to: PictureView;
  startsAt: number;
}

interface ScheduledTravel extends PlayedTravel {
  to: PictureView;
  write: object;
}

const travels = new WeakMap<Element, Travel>();

const scheduled = new WeakMap<Element, ScheduledTravel[]>();

const resting = new WeakMap<Element, PictureView>();

const startOf = (el: Element, travel: PlayedTravel): number => {
  const start = travel.animation.startTime ?? el.ownerDocument.timeline?.currentTime ?? 0;
  return Number(start) + Number(travel.animation.effect?.getTiming().delay ?? 0);
};

export const pictureViewOf = (el: Element): PictureView => {
  const rest = resting.get(el) ?? getPictureView(undefined);
  const travel = travels.get(el);
  if (!travel) {
    return rest;
  }
  const state = travel.animation.playState;
  if (state === "idle") {
    return travel.from;
  }
  if (state === "finished") {
    return rest;
  }
  const progress = travel.animation.effect?.getComputedTiming().progress;
  return progress == null ? rest : mixPictureViews(travel.from, travel.to, progress);
};

export const pictureZoomReach = (el: Element): number => {
  const travel = travels.get(el);
  const views = [
    resting.get(el),
    travel?.from,
    travel?.to,
    ...(scheduled.get(el) ?? []).map((pending) => pending.to),
  ];
  return Math.max(1, ...views.flatMap((view) => (view && Number.isFinite(view.zoom) ? [view.zoom] : [])));
};

const stop = (travel: PlayedTravel) => {
  travel.drop();
  travel.animation.cancel();
};

const endCurrentTravel = (el: Element) => {
  const travel = travels.get(el);
  if (travel) {
    travels.delete(el);
    stop(travel);
  }
};

const endScheduledTravels = (el: Element, keep?: object) => {
  const kept: ScheduledTravel[] = [];
  for (const travel of scheduled.get(el) ?? []) {
    if (keep && travel.write === keep) {
      kept.push(travel);
    } else {
      stop(travel);
    }
  }
  if (kept.length > 0) {
    scheduled.set(el, kept);
  } else {
    scheduled.delete(el);
  }
};

const endTravel = (el: Element) => {
  endCurrentTravel(el);
  endScheduledTravels(el);
};

export const endTravelsWithin = (root: Element) => {
  endTravel(root);
  for (const el of Array.from(root.querySelectorAll(".instance"))) {
    endTravel(el);
  }
};

const headingTo = (el: Element): PictureView | undefined => {
  let last: ScheduledTravel | undefined;
  for (const travel of scheduled.get(el) ?? []) {
    if (!last || startOf(el, travel) >= startOf(el, last)) {
      last = travel;
    }
  }
  if (last) {
    return last.to;
  }
  const travel = travels.get(el);
  return travel && travel.animation.playState !== "finished" ? travel.to : undefined;
};

const sameView = (a: PictureView, b: PictureView) => {
  const first = getViewPlacement(a);
  const second = getViewPlacement(b);
  return first.translate === second.translate && first.scale === second.scale;
};

export const placePicture = (
  el: HTMLElement,
  framing: PictureFramingValues | undefined,
) => {
  const view = getPictureView(framing);
  const heading = headingTo(el);
  if (heading && sameView(heading, view)) {
    return;
  }
  endTravel(el);
  resting.set(el, view);
  el.classList.toggle("framed", Boolean(framing));
  writePlacement(el, getPicturePlacement(framing));
};

export const copyPictureRest = (from: Element, to: Element) => {
  const view = resting.get(from);
  if (view) {
    resting.set(to, view);
  }
};

export const travelAnimations = (el: Element): Animation[] => [
  ...(travels.has(el) ? [travels.get(el)!.animation] : []),
  ...(scheduled.get(el) ?? []).map((travel) => travel.animation),
];

export const haltPicture = (el: HTMLElement) => {
  if (!travels.has(el) && !scheduled.has(el)) {
    return;
  }
  const view = pictureViewOf(el);
  endTravel(el);
  resting.set(el, view);
  writePlacement(el, getViewPlacement(view));
};

const beginTravel = (
  el: HTMLElement,
  to: PictureView,
  play: (keyframes: Keyframe[]) => PlayedTravel | undefined,
  startsAt?: number,
) => {
  const from = pictureViewOf(el);
  endCurrentTravel(el);
  resting.set(el, to);
  el.classList.add("framed");
  const placement = getViewPlacement(to);
  writePlacement(el, placement);
  const played = play([getViewPlacement(from), placement]);
  if (played) {
    travels.set(el, { ...played, from, to, startsAt: startsAt ?? startOf(el, played) });
  }
};

export const travelPicture = (
  el: HTMLElement,
  framing: PictureFramingValues | undefined,
  play: (keyframes: Keyframe[]) => PlayedTravel | undefined,
  write: object,
) => {
  endScheduledTravels(el, write);
  beginTravel(el, getPictureView(framing), play);
};

export const scheduleTravel = (
  el: HTMLElement,
  framing: PictureFramingValues | undefined,
  travel: PlayedTravel,
  write: object,
): (() => void) => {
  endScheduledTravels(el, write);
  const pending: ScheduledTravel = { ...travel, to: getPictureView(framing), write };
  scheduled.set(el, [...(scheduled.get(el) ?? []), pending]);
  return () => {
    const waiting = scheduled.get(el) ?? [];
    if (!waiting.includes(pending)) {
      return;
    }
    const startsAt = startOf(el, pending);
    const order = waiting.indexOf(pending);
    const later = waiting.filter((other, index) => {
      const otherStart = startOf(el, other);
      return otherStart > startsAt || (otherStart === startsAt && index > order);
    });
    for (const other of waiting) {
      if (other !== pending && !later.includes(other)) {
        stop(other);
      }
    }
    if (later.length > 0) {
      scheduled.set(el, later);
    } else {
      scheduled.delete(el);
    }
    const current = travels.get(el);
    if (current && current.startsAt > startsAt) {
      stop(pending);
      return;
    }
    beginTravel(
      el,
      pending.to,
      (keyframes) => {
        (pending.animation.effect as KeyframeEffect | null)?.setKeyframes(keyframes);
        return pending;
      },
      startsAt,
    );
  };
};
