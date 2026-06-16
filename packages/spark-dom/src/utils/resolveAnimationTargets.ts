/**
 * [D15] Consumer-side reconstruction of the engine `UIModule.enqueueAnimation`
 * target redirection.
 *
 * An `Animation` carries a `target` layer selector (defaulting to `"self"`).
 * When that selector is NOT `"self"` and the element doesn't itself carry the
 * class, the animation must play on the matching DESCENDANT elements rather than
 * on `element` itself — e.g. the builtin `align_left`/`align_center`/
 * `align_right` animations target the inner `"instance"` layer, so applying them
 * to the wrapper would move the wrong node. The engine used to do this redirect
 * (via `searchForAll`) before shipping resolved per-element animate effects;
 * D15 ships the raw `Animation` (target intact), so the renderer redirects here.
 *
 * Returns `[element]` for `"self"` or when `element` already carries the class.
 */
export const resolveAnimationTargets = (
  element: HTMLElement,
  targetName: string | undefined,
): HTMLElement[] => {
  const selector = targetName ?? "self";
  if (selector === "self" || element.classList.contains(selector)) {
    return [element];
  }
  return Array.from(
    element.querySelectorAll(`.${CSS.escape(selector)}`),
  ) as HTMLElement[];
};
