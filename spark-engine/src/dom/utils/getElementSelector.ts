export const getElementSelector = (
  rootElementId: string,
  ...classNames: string[]
): string =>
  classNames?.length > 0
    ? `#${rootElementId} .${classNames.join(" .")}`
    : `#${rootElementId}`;
