export interface ElementAnimation {
  keyframes: Keyframe[];
  rtlKeyframes?: Keyframe[];
  options?: KeyframeAnimationOptions;
}

export interface ElementAnimationMap {
  [animationName: string]: ElementAnimation;
}

export interface GetAnimationOptions {
  /**
   * The component's directionality. When set to "rtl", `rtlKeyframes` will be preferred over `keyframes` where
   * available using getAnimation().
   */
  rtl: boolean;
}

const defaultAnimationRegistry = new Map<string, ElementAnimation>();
const customAnimationRegistry = new WeakMap<Element, ElementAnimationMap>();

const ensureAnimation = (animation: ElementAnimation | null) => {
  return animation ?? { keyframes: [], options: { duration: 0 } };
};

//
// Given an ElementAnimation, this function returns a new ElementAnimation where the keyframes property reflects either
// keyframes or rtlKeyframes depending on the specified directionality.
//
const getLogicalAnimation = (animation: ElementAnimation, rtl?: boolean) => {
  if (rtl) {
    return {
      keyframes: animation.rtlKeyframes || animation.keyframes,
      options: animation.options,
    };
  }

  return animation;
};

/**
 * Sets a default animation. Components should use the `name.animation` for primary animations and `name.part.animation`
 * for secondary animations, e.g. `dialog.show` and `dialog.overlay.show`. For modifiers, use `drawer.showTop`.
 */
export const setDefaultAnimation = (
  animationName: string,
  animation: ElementAnimation | null
) => {
  defaultAnimationRegistry.set(animationName, ensureAnimation(animation));
};

/** Sets a custom animation for the specified element. */
export const setAnimation = (
  el: Element,
  animationName: string,
  animation: ElementAnimation | null
) => {
  customAnimationRegistry.set(el, {
    ...customAnimationRegistry.get(el),
    [animationName]: ensureAnimation(animation),
  });
};

/** Gets an element's animation. Falls back to the default if no animation is found. */
export const getAnimation = (
  el: Element,
  animationName: string,
  options?: GetAnimationOptions
) => {
  const customAnimation = customAnimationRegistry.get(el);

  // Check for a custom animation
  if (customAnimation?.[animationName]) {
    return getLogicalAnimation(
      customAnimation[animationName] as ElementAnimation,
      options?.rtl
    );
  }

  // Check for a default animation
  const defaultAnimation = defaultAnimationRegistry.get(animationName);
  if (defaultAnimation) {
    return getLogicalAnimation(defaultAnimation, options?.rtl);
  }

  // Fall back to an empty animation
  return {
    keyframes: [],
    options: { duration: 0 },
  };
};
