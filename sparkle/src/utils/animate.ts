/**
 * Animates an element using keyframes. Returns a promise that resolves after the animation completes or gets canceled.
 */
export const animateTo = (
  el: HTMLElement,
  animation:
    | {
        keyframes: Keyframe[];
        options?: KeyframeAnimationOptions;
      }
    | undefined
) => {
  return new Promise((resolve) => {
    const keyframes = animation?.keyframes;
    const options = animation?.options;
    if (!keyframes) {
      resolve(undefined);
      return;
    }
    if (options?.duration === Infinity) {
      throw new Error("Promise-based animations must be finite.");
    }

    const anim = el.animate(keyframes, {
      ...options,
      duration: prefersReducedMotion() ? 0 : options?.duration,
    });

    anim.addEventListener("cancel", resolve, { once: true });
    anim.addEventListener("finish", resolve, { once: true });
  });
};

/** Parses a CSS duration and returns the number of milliseconds. */
export const parseDuration = (delay: number | string) => {
  delay = delay.toString().toLowerCase();

  if (delay.indexOf("ms") > -1) {
    return parseFloat(delay);
  }

  if (delay.indexOf("s") > -1) {
    return parseFloat(delay) * 1000;
  }

  return parseFloat(delay);
};

/** Tells if the user has enabled the "reduced motion" setting in their browser or OS. */
export const prefersReducedMotion = () => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  return query.matches;
};

/**
 * Stops all active animations on the target element. Returns a promise that resolves after all animations are canceled.
 */
export const stopAnimations = (el: HTMLElement) => {
  return Promise.all(
    el.getAnimations().map((animation) => {
      return new Promise((resolve) => {
        const handleAnimationEvent = requestAnimationFrame(resolve);

        animation.addEventListener("cancel", () => handleAnimationEvent, {
          once: true,
        });
        animation.addEventListener("finish", () => handleAnimationEvent, {
          once: true,
        });
        animation.cancel();
      });
    })
  );
};

/**
 * We can't animate `height: auto`, but we can calculate the height and shim keyframes by replacing it with the
 * element's scrollHeight before the animation.
 */
export const shimKeyframesHeightAuto = (
  keyframes: Keyframe[],
  calculatedHeight: number
) => {
  return keyframes.map((keyframe) => ({
    ...keyframe,
    height:
      keyframe["height"] === "auto"
        ? `${calculatedHeight}px`
        : keyframe["height"],
  }));
};
