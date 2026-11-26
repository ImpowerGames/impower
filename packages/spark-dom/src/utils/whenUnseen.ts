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

const styleOf = (el: Element) => el.ownerDocument.defaultView?.getComputedStyle(el);

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
  return pinned && Number(styleOf(el)?.opacity) === 0;
};

const namesDisplay = (el: Element): boolean => {
  const style = styleOf(el);
  if (!style || style.display === "contents") {
    return true;
  }
  const transitioned = style.transitionProperty.split(",").map((property) => property.trim());
  if (
    transitioned.includes("display") ||
    (transitioned.includes("all") && String(style.getPropertyValue("transition-behavior")).includes("allow-discrete"))
  ) {
    return true;
  }
  return el.getAnimations().some((animation) => {
    const effect = animation.effect as KeyframeEffect | null;
    return (
      (animation as CSSTransition).transitionProperty === "display" ||
      (typeof effect?.getKeyframes === "function" && effect.getKeyframes().some((frame) => frame["display"] != null))
    );
  });
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

const chainTo = (el: Element, target: Element): Element[] | undefined => {
  const els: Element[] = [];
  for (let at: Element | null = el; at; at = at.parentElement) {
    els.push(at);
    if (at === target || inTopLayer(at)) {
      return els;
    }
  }
  return undefined;
};

const hidden = (el: Element, target: Element): boolean => {
  const chain = chainTo(el, target);
  return chain != null && chain.some(transparent) && !chain.some(namesDisplay);
};

const topLayerWithin = (root: Element | ShadowRoot): Element[] => {
  const found: Element[] = [];
  for (const selector of TOP_LAYER) {
    try {
      found.push(...Array.from(root.querySelectorAll(selector)));
    } catch {}
  }
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (el.shadowRoot) {
      found.push(...topLayerWithin(el.shadowRoot));
    }
  }
  return found;
};

export interface UnseenPicture {
  element: Element;
  target: Element;
}

const unseen = ({ element, target }: UnseenPicture): boolean =>
  !element.isConnected ||
  (hidden(element, target) &&
    topLayerWithin(element).every((layer) => hidden(layer, target)) &&
    (!element.shadowRoot || topLayerWithin(element.shadowRoot).every((layer) => hidden(layer, target))));

export const whenUnseen = (pictures: UnseenPicture[], until: Promise<unknown>): Promise<void> =>
  new Promise((resolve) => {
    if (pictures.length === 0 || pictures.some(({ element }) => typeof element.getAnimations !== "function")) {
      return;
    }
    let watching = true;
    const stop = () => {
      watching = false;
    };
    until.then(stop, stop);
    const view = pictures[0]!.element.ownerDocument.defaultView;
    const check = () => {
      if (!watching) {
        return;
      }
      if (pictures.every(unseen)) {
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
