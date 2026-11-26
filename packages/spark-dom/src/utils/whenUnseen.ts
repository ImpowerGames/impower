type Hold = "pins" | "keeps" | "lifts" | "none";

const FILLS_FORWARDS = new Set(["forwards", "both"]);

const isZero = (frame: ComputedKeyframe) => Number.parseFloat(String(frame["opacity"])) === 0;

const holdOf = (animation: Animation): Hold => {
  const effect = animation.effect as KeyframeEffect | null;
  if (!effect || animation.playState === "idle" || typeof effect.getKeyframes !== "function") {
    return "none";
  }
  const frames = effect.getKeyframes().filter((frame) => frame["opacity"] != null);
  if (frames.length === 0) {
    return "none";
  }
  const timing = effect.getComputedTiming();
  const fills = FILLS_FORWARDS.has(String(effect.getTiming().fill ?? "none"));
  const ended = Number(timing.localTime ?? -Infinity) >= Number(timing.endTime ?? Infinity);
  if (ended && !fills) {
    return "none";
  }
  if (
    (effect.composite ?? "replace") !== "replace" ||
    (effect.iterationComposite ?? "replace") !== "replace" ||
    frames.some((frame) => (frame.composite ?? "auto") !== "auto" && frame.composite !== "replace")
  ) {
    return "lifts";
  }
  const progress = timing.progress;
  if (fills && animation.playbackRate > 0 && progress != null) {
    const at = (offset: number) => frames.filter((frame) => frame.computedOffset === offset).at(-1);
    const start = at(0);
    const end = at(1);
    if (frames.every(isZero) && start && end) {
      return "pins";
    }
    const settled = ended && progress === 1 ? end : ended && progress === 0 ? start : undefined;
    if (settled && isZero(settled)) {
      return "pins";
    }
  }
  return frames.every(isZero) ? "keeps" : "lifts";
};

const transparent = (el: Element): boolean => {
  let pinned = false;
  for (const animation of el.getAnimations()) {
    const hold = holdOf(animation);
    if (hold === "pins") {
      pinned = true;
    } else if (hold === "lifts") {
      pinned = false;
    }
  }
  return pinned;
};

const lineage = (el: Element): Element[] => {
  const els: Element[] = [];
  for (let at: Element | null = el; at; at = at.parentElement) {
    els.push(at);
  }
  return els;
};

export const whenUnseen = (elements: Element[], until: Promise<unknown>): Promise<void> =>
  new Promise((resolve) => {
    if (elements.length === 0 || elements.some((el) => typeof el.getAnimations !== "function")) {
      return;
    }
    let watching = true;
    const stop = () => {
      watching = false;
    };
    until.then(stop, stop);
    const watched = new Set<Animation>();
    const check = () => {
      if (!watching) {
        return;
      }
      if (elements.every((el) => !el.isConnected || lineage(el).some(transparent))) {
        watching = false;
        resolve();
        return;
      }
      for (const el of new Set(elements.flatMap(lineage))) {
        for (const animation of el.getAnimations()) {
          if (!watched.has(animation)) {
            watched.add(animation);
            animation.finished.then(check, check);
          }
        }
      }
    };
    check();
  });
