import { getElementSelector } from "./getElementSelector";

export const getElements = <T extends HTMLElement>(
  rootElementId: string,
  ...classNames: string[]
): T[] =>
  Array.from(
    document.querySelectorAll<T>(
      getElementSelector(rootElementId, ...classNames)
    )
  );
