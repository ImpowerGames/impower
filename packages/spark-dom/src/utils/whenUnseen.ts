type Hold = "pins" | "keeps" | "lifts" | "none";

const FILLS_FORWARDS = new Set(["forwards", "both"]);

const MONOTONIC_EASING = /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|steps\([^)]*\))$/;

const isZero = (frame: ComputedKeyframe) => Number.parseFloat(String(frame["opacity"])) === 0;

const isMonotonic = (easing: string) => {
  if (MONOTONIC_EASING.test(easing)) {
    return true;
  }
  const bezier = /^cubic-bezier\(([^)]*)\)$/.exec(easing);
  if (!bezier) {
    return false;
  }
  const [, y1, , y2] = bezier[1]!.split(",").map(Number);
  return [y1, y2].every((y) => y != null && y >= 0 && y <= 1);
};

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
  const settings = effect.getTiming();
  const offsets = frames.map((frame) => frame.computedOffset);
  const forward =
    fills &&
    animation.playbackRate > 0 &&
    progress != null &&
    (ended ||
      ((settings.direction ?? "normal") === "normal" &&
        Number(settings.iterations ?? 1) === 1 &&
        Number(settings.iterationStart ?? 0) === 0 &&
        isMonotonic(String(settings.easing ?? "linear"))));
  const from = forward ? Math.max(...offsets.filter((offset) => offset <= progress)) : -Infinity;
  const to = forward && ended ? Math.min(...offsets.filter((offset) => offset >= progress)) : Infinity;
  const ahead = frames.filter((frame) => frame.computedOffset >= from && frame.computedOffset <= to);
  if (!ahead.every(isZero)) {
    return "lifts";
  }
  const bounded =
    (Number.isFinite(from) || offsets.includes(0)) && (Number.isFinite(to) || offsets.includes(1));
  return fills && animation.playbackRate > 0 && progress != null && bounded ? "pins" : "keeps";
};

const changesDisplay = (animation: Animation) => {
  const effect = animation.effect as KeyframeEffect | null;
  return (
    typeof effect?.getKeyframes === "function" &&
    effect.getKeyframes().some((frame) => frame["display"] != null)
  );
};

const transparent = (el: Element): boolean => {
  const animations = el.getAnimations();
  let pinned = false;
  for (const animation of animations) {
    const hold = holdOf(animation);
    if (hold === "pins") {
      pinned = true;
    } else if (hold === "lifts") {
      pinned = false;
    }
  }
  if (!pinned || animations.some(changesDisplay)) {
    return false;
  }
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return style?.display !== "contents" && Number(style?.opacity) === 0;
};

const TOP_LAYER = [":popover-open", ":modal", ":fullscreen"];

const inTopLayer = (el: Element) =>
  TOP_LAYER.some((selector) => {
    try {
      return el.matches(selector);
    } catch {
      return false;
    }
  });

const lineage = (el: Element): Element[] => {
  const els: Element[] = [];
  for (let at: Element | null = el; at; at = inTopLayer(at) ? null : at.parentElement) {
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
    const view = elements[0]!.ownerDocument.defaultView;
    const check = () => {
      if (!watching) {
        return;
      }
      if (elements.every((el) => !el.isConnected || lineage(el).some(transparent))) {
        watching = false;
        resolve();
        return;
      }
      if (view?.requestAnimationFrame) {
        view.requestAnimationFrame(check);
      } else {
        setTimeout(check, 16);
      }
    };
    check();
  });
