import { getElementSelector } from "./getElementSelector";

export const getElement = <T extends HTMLElement>(
  rootElementId: string,
  ...classNames: string[]
): T | null =>
  document.querySelector<T>(getElementSelector(rootElementId, ...classNames));
