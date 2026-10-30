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
